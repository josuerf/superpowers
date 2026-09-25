#!/usr/bin/env node
/**
 * Stop Hook — Deterministic Completion-Time Quality Gates
 *
 * Runs verify-all when significant uncommitted changes THAT THIS SESSION MADE
 * exist at session stop. The gate is scoped to files edited via Write/Edit/
 * MultiEdit/NotebookEdit in the current transcript, so pre-existing uncommitted
 * changes already in the working tree when the session opened never trigger it.
 * This makes quality gates deterministic (hook-based) rather than skill-dependent.
 *
 * Input:  stdin JSON with { session_id, cwd, ... }
 * Output: stdout JSON with decision/reason to block on failure, or {} to continue
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Absolute path to the harness CLI bundled with this plugin — resolved once
// from this file's own location, not the target project's cwd, since the
// harness lives inside the plugin install, not the user's repo.
const CLI_PATH = path.join(__dirname, '..', 'tools', 'harness', 'cli.ts');

// On Windows, npm-installed CLI shims (npx, tsc, ...) are `.cmd` files.
// `spawnSync('npx', ...)` without a shell fails with ENOENT (bare `npx` isn't
// a real executable — reproduced: status null, empty stdout/stderr, which
// used to surface as the unhelpful "Verification failed with no output").
// Passing `npx.cmd` directly instead throws EINVAL: Node refuses to spawn
// .cmd/.bat files without `shell: true` (its fix for the batch-file argument
// injection class of bugs). So `shell: true` is required here, which in turn
// means Node does NOT escape `args` for us (see DEP0190) — each argument is
// quoted below so paths with spaces (e.g. "C:\Users\Jane Doe\...") survive
// the shell's tokenizing instead of being split into multiple arguments.
function shellQuote(arg) {
  const str = String(arg);
  if (process.platform === 'win32') {
    return /[\s"]/.test(str) ? `"${str.replace(/"/g, '\\"')}"` : str;
  }
  return /[\s"'$`\\]/.test(str) ? `'${str.replace(/'/g, "'\\''")}'` : str;
}

const LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'hooks-logs'
);
const VERIFY_GUARD_FILE = path.join(LOG_DIR, 'verify-on-stop-fired.lock');
const VERIFY_GUARD_TTL_MS = 5 * 60 * 1000; // 5 minutes between verification runs

// Default minimum files changed to trigger verification (avoids noise from
// single edits). Overridable per-project via .harness.config.json — see
// getMinFilesForVerify. A workspace harness can lower this to 1 to gate every
// source edit; other projects keep the default by omitting the key.
const MIN_FILES_FOR_VERIFY = 3;

// Resolve the trigger threshold from .harness.config.json (verifyOnStop.minFiles)
// at the project root. Falls back to MIN_FILES_FOR_VERIFY on any error — missing
// file, parse failure, or a missing/non-integer/<1 value — so a broken or absent
// config never changes gate behavior.
function getMinFilesForVerify(cwd) {
  try {
    const configPath = path.join(cwd || process.cwd(), '.harness.config.json');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const v = raw && raw.verifyOnStop && raw.verifyOnStop.minFiles;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
    return MIN_FILES_FOR_VERIFY;
  } catch {
    return MIN_FILES_FOR_VERIFY;
  }
}

// File patterns that should NOT trigger verification (config, docs, etc.)
const EXCLUDED_PATTERNS = [
  /\.md$/,
  /\.txt$/,
  /\.json$/,
  /\.ya?ml$/,
  /\.toml$/,
  /\.lock$/,
  /\.env/,
  /Dockerfile/,
  /docker-compose/,
  /\.gitignore$/,
  /CLAUDE\.md$/i,
  /SKILL\.md$/i,
  /\.prettierrc/,
  /\.eslintrc/,
  /tsconfig/,
  /\.git/,
];

function shouldExclude(filePath) {
  return EXCLUDED_PATTERNS.some(p => p.test(filePath));
}

function shouldFire() {
  try {
    if (fs.existsSync(VERIFY_GUARD_FILE)) {
      const stat = fs.statSync(VERIFY_GUARD_FILE);
      const age = Date.now() - stat.mtimeMs;
      if (age < VERIFY_GUARD_TTL_MS) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

function setGuard() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(VERIFY_GUARD_FILE, new Date().toISOString());
  } catch {
    // Ignore
  }
}

// Windows filesystems are case-insensitive, so every path comparison and Set
// key in this file routes through here first.
function normalizeCase(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

// The same directory reaches this hook spelled several ways: the harness may
// hand over a Windows 8.3 short path (C:\Users\JOSUE~1.FRE\...), git always
// answers with the long one, and a symlinked checkout differs from both. Two
// spellings compare unequal, which silently emptied the changed-file list, so
// every path is resolved to its real on-disk form before being compared. A path
// that does not exist (deleted file, declared-but-missing root) falls back to a
// plain resolve rather than throwing.
function realPath(p) {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync.native(abs);
  } catch {
    return abs;
  }
}

function isInside(child, parent) {
  const c = normalizeCase(realPath(child));
  const p = normalizeCase(realPath(parent));
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

// `git status --porcelain` prints paths relative to the REPOSITORY root, not to
// the directory it ran in. In a workspace harness those differ by a whole level
// (workspace root vs projects/<repo>), so resolving the output needs the repo
// root, not the directory we asked about.
function gitTopLevel(dir) {
  try {
    const res = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (res.status !== 0 || res.error) return null;
    const top = (res.stdout || '').trim();
    return top ? path.resolve(top) : null;
  } catch {
    return null;
  }
}

// Absolute paths of uncommitted, non-excluded source files under `dir`, read
// from whichever git repository owns `dir` and then scoped back to `dir`.
// Asking per directory (instead of once at the session cwd) is what lets a
// workspace root and each of its projects be counted separately, and what makes
// edits inside a project the workspace's git cannot see — its own .git, or an
// ignored projects/ entry — visible to the gate at all.
function getUncommittedSourceFiles(dir) {
  const root = realPath(dir || process.cwd());
  try {
    const result = spawnSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.status !== 0 || result.error) return [];

    const top = realPath(gitTopLevel(root) || root);
    const lines = (result.stdout || '').split('\n').filter(l => l.trim().length > 0);
    const sourceFiles = [];

    for (const line of lines) {
      // Format: "XY filepath" where X=index status, Y=worktree status — or
      // "XY old -> new" for a rename/copy, where the new path is the one that
      // exists on disk and is worth verifying.
      const raw = line.slice(3).trim();
      const arrow = raw.lastIndexOf(' -> ');
      const filepath = arrow === -1 ? raw : raw.slice(arrow + 4).trim();
      if (!filepath || shouldExclude(filepath)) continue;
      const abs = path.resolve(top, filepath);
      if (isInside(abs, root)) sourceFiles.push(abs);
    }

    return sourceFiles;
  } catch {
    return [];
  }
}

// Editing tools whose targets count as "changes this session made".
const SESSION_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Resolve a git/transcript path to a comparable absolute form. git status emits
// repo-relative forward-slash paths; the transcript stores absolute paths. Both
// route through path.resolve(cwd, ...); on Windows we lowercase since the FS is
// case-insensitive.
function normalizePath(cwd, p) {
  return normalizeCase(realPath(path.resolve(cwd || process.cwd(), p)));
}

// Returns a Set of normalized absolute paths edited via Write/Edit/MultiEdit/
// NotebookEdit in this session's transcript. Returns null (NOT an empty Set)
// when the transcript is missing or unreadable, so the caller can tell apart
// "session edited nothing" (empty Set → nothing to verify, skip the gate) from
// "we don't know what the session changed" (null → fall back to whole-tree).
function getSessionEditedFiles(transcriptPath, cwd) {
  if (!transcriptPath) return null;
  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }

  const edited = new Set();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // tolerate partial/non-JSON lines
    }

    const blocks =
      entry && entry.message && Array.isArray(entry.message.content)
        ? entry.message.content
        : Array.isArray(entry && entry.content)
          ? entry.content
          : [];

    for (const block of blocks) {
      if (!block || block.type !== 'tool_use' || !SESSION_EDIT_TOOLS.has(block.name)) {
        continue;
      }
      const input = block.input || {};
      const fp = input.file_path || input.notebook_path;
      if (typeof fp === 'string' && fp.length > 0) {
        edited.add(normalizePath(cwd, fp));
      }
    }
  }
  return edited;
}

// ── Which project to verify ──────────────────────────────────────────────────
// A workspace harness keeps the real repositories one level down (projects/<repo>)
// while the session's cwd is the workspace root. Verifying the workspace root
// measures nothing — no test suite lives at that level — so the harness reports
// "Coverage 0.0%" in 0.1s and blocks every session. The isUndetectedStackFailure
// escape hatch does not open either, because detectStack does NOT fail there: its
// node-std fallback finds stray .js under scripts/. So resolve the project roots
// the session actually touched and verify each of those instead.

// Manifests a stack can be detected from and tests can be run in. `.harness.config.json`
// is deliberately NOT here: a workspace root has one too, so it marks a boundary
// but never, on its own, a verifiable project.
const STACK_MANIFESTS = [
  'package.json',
  'deno.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Cargo.toml',
  'composer.json',
  'Gemfile',
];

const ROOT_MARKERS = [...STACK_MANIFESTS, '.harness.config.json'];

function hasStackManifest(dir) {
  if (STACK_MANIFESTS.some(f => fs.existsSync(path.join(dir, f)))) return true;
  try {
    return fs.readdirSync(dir).some(f => /\.(csproj|sln)$/i.test(f));
  } catch {
    return false;
  }
}

// Nearest ancestor of `file` that looks like a project root, bounded by `cwdAbs`
// so the walk never escapes the session directory. Returns null when the file
// sits outside cwd, or when no marker is found on the way up — the caller then
// falls back rather than guessing.
function findProjectRoot(file, cwdAbs) {
  let dir = realPath(path.dirname(path.resolve(file)));
  if (!isInside(dir, cwdAbs)) return null;
  for (;;) {
    if (ROOT_MARKERS.some(m => fs.existsSync(path.join(dir, m)))) return dir;
    if (normalizeCase(dir) === normalizeCase(cwdAbs)) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Explicit override from .harness.config.json (verifyOnStop.projectRoots), for
// workspaces where inference is not enough — a project the session edits through
// generated files, say. Entries are relative to cwd (absolute paths are accepted
// too) and anything that is not an existing directory inside cwd is dropped, so a
// stale or malformed entry degrades to inference instead of breaking the gate.
function getDeclaredProjectRoots(cwdAbs) {
  try {
    const configPath = path.join(cwdAbs, '.harness.config.json');
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const declared = raw && raw.verifyOnStop && raw.verifyOnStop.projectRoots;
    if (!Array.isArray(declared)) return [];
    const roots = [];
    for (const entry of declared) {
      if (typeof entry !== 'string' || entry.trim().length === 0) continue;
      const abs = realPath(path.resolve(cwdAbs, entry));
      if (!isInside(abs, cwdAbs)) continue;
      try {
        if (!fs.statSync(abs).isDirectory()) continue;
      } catch {
        continue;
      }
      if (!roots.some(r => normalizeCase(r) === normalizeCase(abs))) roots.push(abs);
    }
    return roots;
  } catch {
    return [];
  }
}

// Resolution order: declared roots > roots inferred from the touched files >
// cwd. In a single-repo project every path lands on cwd, so behavior there is
// unchanged.
function resolveVerifyRoots(cwd, touchedFiles) {
  const cwdAbs = realPath(cwd || process.cwd());
  const declared = getDeclaredProjectRoots(cwdAbs);
  if (declared.length > 0) return declared;

  const roots = [];
  for (const file of touchedFiles || []) {
    const root = findProjectRoot(file, cwdAbs);
    if (!root) continue;
    if (!roots.some(r => normalizeCase(r) === normalizeCase(root))) roots.push(root);
  }
  return roots.length > 0 ? roots : [cwdAbs];
}

// Full verify-all runs share one budget (3 minutes) across every project, so a
// workspace with five touched repositories cannot hold the session hostage for
// fifteen. A project that gets less than MIN_VERIFY_SLICE_MS is skipped rather
// than started and killed halfway.
const VERIFY_TOTAL_BUDGET_MS = 180000;
const MIN_VERIFY_SLICE_MS = 15000;

function runVerifyAll(cwd, timeoutMs = VERIFY_TOTAL_BUDGET_MS) {
  const root = path.resolve(cwd || process.cwd());
  try {
    // --root is passed explicitly, not just as the spawn cwd: the CLI resolves
    // config, stack and report paths from it, and being explicit is what makes
    // the command in the block message reproducible by hand.
    const result = spawnSync('npx', ['tsx', CLI_PATH, 'all', '--root', root].map(shellQuote), {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      shell: true,
    });

    return {
      success: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.status,
    };
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: error.message || 'Verification process failed',
      exitCode: -1,
    };
  }
}

// The harness only knows how to verify a fixed list of app stacks (Next.js,
// Express, FastAPI, ...). A pure tooling/plugin repo (no web/service
// framework) makes `verify()` throw "Could not detect stack" on every
// invocation — a config/environment gap, not a code-quality problem. Never
// trap the user in a permanent block loop over something the harness itself
// cannot evaluate; fail this specific case open like the other setup-error
// cases in this file.
function isUndetectedStackFailure(result) {
  return /Could not detect stack for project/.test(result.stderr || '');
}

// Carrasco gate — ask the harness CLI whether a fresh, passing carrasco code
// review exists for the current change set. This is cheap (fingerprint compare),
// the single source of truth lives in TS, and it fails OPEN on any error so a
// broken setup never traps the user at session stop.
function runCarrascoGate(cwd) {
  try {
    const result = spawnSync(
      'npx',
      ['tsx', CLI_PATH, 'review', 'gate-status', '--root', cwd].map(shellQuote),
      {
        cwd: cwd || process.cwd(),
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        shell: true,
      },
    );
    if (result.error || typeof result.stdout !== 'string') return { block: false };
    // gate-status prints a single JSON line; tolerate extra log lines.
    const line = result.stdout.trim().split('\n').filter(Boolean).pop() || '';
    let status;
    try {
      status = JSON.parse(line);
    } catch {
      return { block: false };
    }
    if (!status || status.gate === 'pass') return { block: false };
    return { block: true, gate: status.gate, reason: status.reason, action: status.action };
  } catch {
    return { block: false };
  }
}

function buildCarrascoBlockReason(status, fileCount) {
  return [
    '<carrasco-review>',
    `Carrasco gate: ${status.reason} (${fileCount} source file(s) with uncommitted changes).`,
    '',
    'A rigorous, standards-enforcing code review is required before completing.',
    `Run the "carrasco-review" skill (or: npx tsx "${CLI_PATH}" review plan, dispatch the carrascos, then review aggregate).`,
    'This is the automatic Stop-hook gate, not an explicit request from your human partner — follow the skill\'s "Automatic Trigger (Stop-hook Gate)" section and run review plan --inline.',
    '',
    'Fix any BLOCK findings and re-run the review, or commit/push to bypass this gate.',
    '</carrasco-review>',
  ].join('\n');
}

const BLOCK_OUTPUT_BUDGET = 3000;

// The real failure reason usually lands on stderr (thrown errors, stack traces);
// stdout is often just progress banners ("Running verify-all..."). Show both,
// stderr first, so a thin stdout banner never hides the actual error.
function formatVerifyOutput(result, budget) {
  const output =
    [result.stderr, result.stdout].filter(Boolean).join('\n\n') ||
    'Verification failed with no output';
  return output.length > budget ? output.slice(0, budget) + '\n... (truncated)' : output;
}

// Accepts the list of per-project failures ({ root, result }), or a bare verify
// result when there is only one project and no root to name.
function buildBlockReason(failures, fileCount, cwd) {
  const list = Array.isArray(failures) ? failures : [{ root: null, result: failures }];
  const budget = Math.max(800, Math.floor(BLOCK_OUTPUT_BUDGET / list.length));
  const base = path.resolve(cwd || process.cwd());

  const lines = [
    '<verify-on-stop>',
    `Quality gate failed in ${list.length} project(s): ${fileCount} source file(s) with uncommitted changes`,
    '',
  ];

  for (const { root, result } of list) {
    // Naming the project (and passing --root) is the whole point: without it the
    // suggested command re-runs at the session cwd, which in a workspace is the
    // directory that produced the wrong result in the first place.
    if (root) {
      const rel = path.relative(base, root);
      lines.push(`Project: ${rel && !rel.startsWith('..') ? rel : root}`);
    }
    lines.push(
      `Run "npx tsx \\"${CLI_PATH}\\" all${root ? ` --root \\"${root}\\"` : ''}" to see full output and fix issues.`,
    );
    lines.push('');
    lines.push('Output:');
    lines.push(formatVerifyOutput(result, budget));
    lines.push('');
  }

  lines.push('Fix all issues before continuing, or commit/push to bypass this gate.');
  lines.push('</verify-on-stop>');
  return lines.join('\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    const cwd = realPath(data.cwd || process.cwd());

    // Scope the gate to files THIS session actually edited. When the transcript
    // is readable we intersect with it: an empty intersection (the session made
    // no edits — e.g. the user just asked a question) means there is nothing to
    // verify and we exit clean, so pre-existing uncommitted changes no longer
    // trap the user. If the transcript is unavailable we fall back to the whole
    // working tree so the gate still works on harnesses that omit transcript_path.
    const sessionEdited = getSessionEditedFiles(data.transcript_path, cwd);
    if (sessionEdited !== null && sessionEdited.size === 0) {
      process.stdout.write('{}');
      return;
    }

    // Which project(s) this session touched. The transcript is the better signal
    // because it records edits the workspace's own git never sees; git status at
    // cwd is the fallback for harnesses that omit transcript_path.
    const touched =
      sessionEdited !== null ? [...sessionEdited] : getUncommittedSourceFiles(cwd);
    const roots = resolveVerifyRoots(cwd, touched);

    // Count uncommitted source changes per root, each read from its own git
    // repository, then verify only the projects that actually have changes.
    const targets = [];
    let sourceFileCount = 0;
    for (const root of roots) {
      const changed = getUncommittedSourceFiles(root).filter(
        (f) => sessionEdited === null || sessionEdited.has(normalizePath(cwd, f)),
      );
      sourceFileCount += changed.length;
      if (changed.length > 0) targets.push({ root, changed });
    }

    if (sourceFileCount < getMinFilesForVerify(cwd)) {
      process.stdout.write('{}');
      return;
    }

    // Carrasco code-review gate (fingerprint-based, runs on every stop with
    // significant changes; not subject to the verify-all TTL guard). Fails open.
    const carrasco = runCarrascoGate(cwd);
    if (carrasco && carrasco.block) {
      console.error(`[verify-on-stop] Carrasco gate ${carrasco.gate}: ${carrasco.reason}`);
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: buildCarrascoBlockReason(carrasco, sourceFileCount),
      }));
      return;
    }

    // Guard: prevent frequent re-verification of the heavy verify-all pipeline
    if (!shouldFire()) {
      process.stdout.write('{}');
      return;
    }

    // Run verify-all, once per touched project
    console.error(
      `[verify-on-stop] Running verify-all on ${sourceFileCount} file(s) in ${targets.length} project(s): ${targets
        .map((t) => `${t.root} (${t.changed.length})`)
        .join(', ')}`,
    );

    const failures = [];
    let remainingMs = VERIFY_TOTAL_BUDGET_MS;

    for (const target of targets) {
      // A root with no stack manifest is a workspace/orchestration directory,
      // not a project. The harness would "detect" node-std from stray scripts,
      // run no tests and report 0% coverage — a measurement gap, not a code
      // problem, so fail open here like the other setup-error cases.
      if (!hasStackManifest(target.root)) {
        console.error(
          `[verify-on-stop] ${target.root} has no stack manifest — nothing for the harness to verify, skipping.`,
        );
        continue;
      }
      if (remainingMs < MIN_VERIFY_SLICE_MS) {
        console.error(
          `[verify-on-stop] verification budget exhausted — ${target.root} not verified.`,
        );
        break;
      }

      const startedAt = Date.now();
      const result = runVerifyAll(target.root, remainingMs);
      remainingMs -= Date.now() - startedAt;

      if (result.success) continue;
      if (isUndetectedStackFailure(result)) {
        console.error(
          `[verify-on-stop] Harness could not detect a known stack for ${target.root} — nothing to verify, failing open.`,
        );
        continue;
      }
      failures.push({ root: target.root, result });
    }

    setGuard();

    if (failures.length === 0) {
      console.error('[verify-on-stop] All quality gates passed');
      process.stdout.write('{}');
      return;
    }

    console.error(
      `[verify-on-stop] Quality gates FAILED in: ${failures.map((f) => f.root).join(', ')}`,
    );

    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: buildBlockReason(failures, sourceFileCount, cwd),
    }));
  } catch {
    process.stdout.write('{}');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    shouldFire,
    setGuard,
    getUncommittedSourceFiles,
    getSessionEditedFiles,
    normalizePath,
    normalizeCase,
    realPath,
    isInside,
    gitTopLevel,
    findProjectRoot,
    getDeclaredProjectRoots,
    resolveVerifyRoots,
    hasStackManifest,
    STACK_MANIFESTS,
    ROOT_MARKERS,
    VERIFY_TOTAL_BUDGET_MS,
    MIN_VERIFY_SLICE_MS,
    SESSION_EDIT_TOOLS,
    runVerifyAll,
    buildBlockReason,
    isUndetectedStackFailure,
    runCarrascoGate,
    buildCarrascoBlockReason,
    MIN_FILES_FOR_VERIFY,
    getMinFilesForVerify,
    EXCLUDED_PATTERNS,
  };
}