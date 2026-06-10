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

const LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'hooks-logs'
);
const VERIFY_GUARD_FILE = path.join(LOG_DIR, 'verify-on-stop-fired.lock');
const VERIFY_GUARD_TTL_MS = 5 * 60 * 1000; // 5 minutes between verification runs

// Minimum files changed to trigger verification (avoids noise from single edits)
const MIN_FILES_FOR_VERIFY = 3;

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

function getUncommittedSourceFiles(cwd) {
  try {
    const result = spawnSync('git', ['status', '--porcelain'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.status !== 0 || result.error) return [];

    const lines = (result.stdout || '').split('\n').filter(l => l.trim().length > 0);
    const sourceFiles = [];

    for (const line of lines) {
      // Format: "XY filepath" where X=index status, Y=worktree status
      const filepath = line.slice(3).trim();
      if (filepath && !shouldExclude(filepath)) {
        sourceFiles.push(filepath);
      }
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
  let abs = path.resolve(cwd || process.cwd(), p);
  if (process.platform === 'win32') abs = abs.toLowerCase();
  return abs;
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

function runVerifyAll(cwd) {
  const cliPath = path.join(__dirname, '..', 'tools', 'harness', 'cli.ts');

  try {
    const result = spawnSync('npx', ['tsx', cliPath, 'all'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 180000, // 3 minutes for full verify-all
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
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

// Carrasco gate — ask the harness CLI whether a fresh, passing carrasco code
// review exists for the current change set. This is cheap (fingerprint compare),
// the single source of truth lives in TS, and it fails OPEN on any error so a
// broken setup never traps the user at session stop.
function runCarrascoGate(cwd) {
  const cliPath = path.join(__dirname, '..', 'tools', 'harness', 'cli.ts');
  try {
    const result = spawnSync('npx', ['tsx', cliPath, 'review', 'gate-status', '--root', cwd], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });
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
    'Run the "carrasco-review" skill (or: npx tsx tools/harness/cli.ts review plan, dispatch the carrascos, then review aggregate).',
    '',
    'Fix any BLOCK findings and re-run the review, or commit/push to bypass this gate.',
    '</carrasco-review>',
  ].join('\n');
}

function buildBlockReason(result, fileCount) {
  const output = result.stdout || result.stderr || 'Verification failed with no output';
  const truncated = output.length > 3000 ? output.slice(0, 3000) + '\n... (truncated)' : output;

  return [
    '<verify-on-stop>',
    `Quality gate failed: ${fileCount} source file(s) with uncommitted changes`,
    '',
    'Run "npx tsx tools/harness/cli.ts all" to see full output and fix issues.',
    '',
    'Output:',
    truncated,
    '',
    'Fix all issues before continuing, or commit/push to bypass this gate.',
    '</verify-on-stop>',
  ].join('\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();

    // Check for significant uncommitted source changes
    const uncommitted = getUncommittedSourceFiles(cwd);

    // Scope the gate to files THIS session actually edited. When the transcript
    // is readable we intersect with it: an empty intersection (the session made
    // no edits — e.g. the user just asked a question) means there is nothing to
    // verify and we exit clean, so pre-existing uncommitted changes no longer
    // trap the user. If the transcript is unavailable we fall back to the whole
    // working tree so the gate still works on harnesses that omit transcript_path.
    const sessionEdited = getSessionEditedFiles(data.transcript_path, cwd);
    const sourceFiles =
      sessionEdited === null
        ? uncommitted
        : uncommitted.filter((f) => sessionEdited.has(normalizePath(cwd, f)));

    if (sourceFiles.length < MIN_FILES_FOR_VERIFY) {
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
        reason: buildCarrascoBlockReason(carrasco, sourceFiles.length),
      }));
      return;
    }

    // Guard: prevent frequent re-verification of the heavy verify-all pipeline
    if (!shouldFire()) {
      process.stdout.write('{}');
      return;
    }

    // Run verify-all
    console.error(`[verify-on-stop] Running verify-all on ${sourceFiles.length} files...`);
    const result = runVerifyAll(cwd);

    if (result.success) {
      console.error('[verify-on-stop] All quality gates passed');
      setGuard();
      process.stdout.write('{}');
      return;
    }

    // Verification failed - block
    console.error('[verify-on-stop] Quality gates FAILED');
    setGuard();

    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: buildBlockReason(result, sourceFiles.length),
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
    SESSION_EDIT_TOOLS,
    runVerifyAll,
    buildBlockReason,
    runCarrascoGate,
    buildCarrascoBlockReason,
    MIN_FILES_FOR_VERIFY,
    EXCLUDED_PATTERNS,
  };
}