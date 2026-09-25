#!/usr/bin/env node
/**
 * Stop Hook — Contextual Reminders
 *
 * When Claude finishes responding, checks session context and provides
 * gentle reminders about TDD, verification, and commit hygiene.
 * These reminders reinforce discipline skills deterministically.
 *
 * Uses a file-based guard to fire only once per session to prevent
 * infinite loops (Stop hook returning content causes Claude to resume).
 *
 * Input:  stdin JSON with { session_id, cwd, ... }
 * Output: stdout JSON with decision/reason continuation payload (only when
 * actionable reminders exist), or {} to let Claude stop normally.
 * Uses decision+reason rather than hookSpecificOutput for broader version compat.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const LOG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'hooks-logs'
);
const EDIT_LOG = path.join(LOG_DIR, 'edit-log.txt');
const LAST_SAVED_FILE = path.join(LOG_DIR, 'last-saved-entry.txt');
const STATS_FILE = path.join(LOG_DIR, 'session-stats.json');
const GUARD_FILE = path.join(LOG_DIR, 'stop-hook-fired.lock');

// Guard: only fire once per session (prevent infinite loop)
// The guard file is created on first fire and checked on subsequent fires.
// It auto-expires after 2 minutes so subsequent Claude stops can show reminders.
const GUARD_TTL_MS = 2 * 60 * 1000;

function shouldFire() {
  try {
    if (fs.existsSync(GUARD_FILE)) {
      const stat = fs.statSync(GUARD_FILE);
      const age = Date.now() - stat.mtimeMs;
      if (age < GUARD_TTL_MS) {
        return false; // Guard is active, don't fire
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
    fs.writeFileSync(GUARD_FILE, new Date().toISOString());
  } catch {
    // Ignore guard write errors
  }
}

// Common test file patterns
const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.(go|py|rb)$/,
  /test_[^/]+\.py$/,
  /Tests?\.[^/]+$/,
  /\.test$/,
  /__tests__\//,
  /(?:^|[/\\])test[-_][^/\\]+\.[jt]sx?$/i,
  /[/\\]tests?[/\\]/i,
];

// Common source file patterns (non-test, non-config)
const SOURCE_PATTERNS = [
  /\.(js|jsx|ts|tsx|py|rb|go|rs|java|cs|cpp|c|h|hpp|swift|kt|scala|php)$/,
];

// Files that are clearly config/non-source
const CONFIG_PATTERNS = [
  /package\.json$/,
  /tsconfig.*\.json$/,
  /\.eslintrc/,
  /\.prettierrc/,
  /\.gitignore$/,
  /\.env/,
  /Dockerfile/,
  /docker-compose/,
  /\.ya?ml$/,
  /\.toml$/,
  /\.cfg$/,
  /\.ini$/,
  /\.md$/,
  /\.lock$/,
  /CLAUDE\.md$/,
  /SKILL\.md$/,
];

function isTestFile(filePath) {
  return TEST_PATTERNS.some(p => p.test(filePath));
}

function isSourceFile(filePath) {
  return SOURCE_PATTERNS.some(p => p.test(filePath)) && !CONFIG_PATTERNS.some(p => p.test(filePath));
}

/**
 * Parse a raw log line into an entry object.
 * Supports both legacy 3-field format and new 4-field format with session_id.
 */
function parseLogLine(line) {
  const parts = line.split(' | ');
  if (parts.length < 3) return null;
  if (parts.length >= 4) {
    // New format: timestamp | session_id | tool | filePath
    return {
      timestamp: parts[0],
      sessionId: parts[1] || null,
      tool: parts[2],
      filePath: parts.slice(3).join(' | '),
    };
  }
  // Legacy format: timestamp | tool | filePath
  return {
    timestamp: parts[0],
    sessionId: null,
    tool: parts[1],
    filePath: parts.slice(2).join(' | '),
  };
}

/**
 * Return true if an entry matches the given sessionId filter.
 * When sessionId is provided: only entries with a matching sessionId pass.
 * When sessionId is null/undefined: legacy entries (no sessionId) pass.
 */
function matchesSession(entry, sessionId) {
  if (sessionId) {
    return entry.sessionId === sessionId;
  }
  return entry.sessionId === null;
}

/**
 * Read recent edits from the edit log (last 30 minutes), filtered to the current session.
 */
function getRecentEdits(sessionId) {
  try {
    if (!fs.existsSync(EDIT_LOG)) return [];

    const content = fs.readFileSync(EDIT_LOG, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);

    return lines
      .map(parseLogLine)
      .filter(entry =>
        entry &&
        new Date(entry.timestamp) > cutoff &&
        matchesSession(entry, sessionId)
      );
  } catch {
    return [];
  }
}

/**
 * Return the timestamp of the last [saved] entry written to session-log.md,
 * or null if no saved entry exists yet this session.
 */
function getLastSavedEntryTime() {
  try {
    if (!fs.existsSync(LAST_SAVED_FILE)) return null;
    const ts = new Date(fs.readFileSync(LAST_SAVED_FILE, 'utf8').trim());
    return isNaN(ts.getTime()) ? null : ts;
  } catch {
    return null;
  }
}

/**
 * Return all edit log entries after the given timestamp, filtered to the current session.
 * If timestamp is null, returns all session entries (i.e. no [saved] baseline exists).
 */
function getEditsAfter(timestamp, sessionId) {
  try {
    if (!fs.existsSync(EDIT_LOG)) return [];
    const cutoff = timestamp || new Date(0);
    return fs.readFileSync(EDIT_LOG, 'utf8')
      .split('\n').filter(Boolean)
      .map(parseLogLine)
      .filter(e => e && new Date(e.timestamp) > cutoff && matchesSession(e, sessionId));
  } catch {
    return [];
  }
}

/**
 * Load session statistics for progress visibility.
 */
function getSessionStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Format session stats into a brief summary line.
 */
function formatStatsSummary(stats) {
  if (!stats || stats.totalSkillCalls === 0) return null;

  const duration = Math.round((Date.now() - new Date(stats.startedAt).getTime()) / 60000);
  const skillNames = Object.entries(stats.skillInvocations)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  return `Session summary: ${duration}min, ${stats.totalSkillCalls} skill invocations [${skillNames}]`;
}

/**
 * Generate contextual reminders based on edit history and session stats.
 * Returns array of reminder strings.
 */
function getUncommittedCount(cwd) {
  try {
    const result = spawnSync('git', ['status', '--porcelain'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.status !== 0 || result.error) return 0;
    const lines = (result.stdout || '').split('\n').filter(l => l.trim().length > 0);
    return lines.length;
  } catch {
    return 0;
  }
}

function generateReminders(edits, cwd) {
  const reminders = [];

  // Session stats summary (always include if available)
  const stats = getSessionStats();
  const statsSummary = formatStatsSummary(stats);
  if (statsSummary) {
    reminders.push(statsSummary);
  }

  if (edits.length === 0) return reminders;

  const editedPaths = [...new Set(edits.map(e => e.filePath))];
  const sourceFiles = editedPaths.filter(isSourceFile);
  const testFiles = editedPaths.filter(isTestFile);

  // TDD reminder: source files changed without corresponding tests
  const untestedSources = sourceFiles.filter(src => !isTestFile(src));
  if (untestedSources.length > 0 && testFiles.length === 0) {
    reminders.push(
      `TDD reminder: ${untestedSources.length} source file(s) modified without test changes. ` +
      `Consider running tests or invoking TDD workflow if behavior changed.`
    );
  }

  // Commit reminder: check actual uncommitted changes via git, not just session edits.
  // Using edit-log count was wrong — it fired even after a commit was made mid-session.
  if (editedPaths.length >= 5) {
    const uncommittedCount = getUncommittedCount(cwd);
    if (uncommittedCount >= 5) {
      reminders.push(
        `Commit reminder: ${uncommittedCount} files with uncommitted changes. ` +
        `Consider committing incremental progress to avoid losing work.`
      );
    }
  }

  return reminders;
}


/**
 * Detect sessions where significant architectural decisions were made.
 * These are sessions that modified skill files, hooks, or plugin config —
 * places where the "why" matters and would be costly to rediscover.
 */
function isSignificantSession(edits) {
  const sigPatterns = [
    /SKILL\.md$/i,
    /[/\\]hooks[/\\][^/\\]+\.js$/,
    /[/\\]hooks[/\\]session-start$/,
    /skill-rules\.json$/,
    /CLAUDE\.md$/i,
    /agents[/\\][^/\\]+\.md$/i,
    /[/\\]specs[/\\][^/\\]+\.md$/i,
    /[/\\]plans[/\\][^/\\]+\.md$/i,
    /plugin\.universal\.yaml$/,
  ];
  return edits.some(e => sigPatterns.some(p => p.test(e.filePath)));
}

/**
 * Check if state.md exists in cwd and has been overtaken by recent source-file
 * edits — a signal that active task state may have drifted since last save.
 * Returns a reminder string if stale, null otherwise.
 *
 * Threshold: state.md older than at least 2 source-file edits that occurred
 * after it was last written. Config-only edits are excluded (noise).
 */
function checkStateMdStaleness(cwd, recentEdits) {
  try {
    const stateMdPath = path.join(cwd, 'state.md');
    if (!fs.existsSync(stateMdPath)) return null;

    const stateMtime = fs.statSync(stateMdPath).mtimeMs;
    const editsAfterState = recentEdits.filter(e =>
      new Date(e.timestamp).getTime() > stateMtime && isSourceFile(e.filePath)
    );

    if (editsAfterState.length >= 2) {
      return (
        'State.md sync: state.md was written before recent code changes in this session. ' +
        'If progress was made on the active task, update state.md via the context-management skill.'
      );
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check the last 2 [saved] entries in session-log.md and warn if they
 * exceed the token budget. Hard cap is 250 tokens (~1000 chars) per entry.
 * Returns a warning string if over budget, null otherwise.
 */
function checkSessionLogSize(cwd) {
  try {
    const sessionLogPath = path.join(cwd, 'session-log.md');
    if (!fs.existsSync(sessionLogPath)) return null;

    const lines = fs.readFileSync(sessionLogPath, 'utf8').split('\n');
    const entries = [];
    let current = null;

    for (const line of lines) {
      if (/^## .+\[saved\]/.test(line)) {
        if (current) entries.push(current);
        current = { header: line, chars: line.length + 1 };
      } else if (current) {
        current.chars += line.length + 1;
      }
    }
    if (current) entries.push(current);

    const last2 = entries.slice(-2);
    const HARD_CAP_CHARS = 1500; // ~375 tokens — accommodates multi-subsystem sessions
    const over = last2.filter(e => e.chars > HARD_CAP_CHARS);
    if (over.length === 0) return null;

    const totalTokens = last2.reduce((s, e) => s + Math.round(e.chars / 4), 0);
    return (
      `Session-log size warning: last 2 [saved] entries inject ~${totalTokens} tokens per session ` +
      `(target: <500). Entries over budget: ${over.map(e => e.header.trim()).join('; ')}. ` +
      `Trim to: Goal / Decisions / Rejected / Open only. Hard cap 375 tokens per entry. ` +
      `Task checklists → state.md. Speculative analysis → design docs. Test results → delete.`
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lessons reminder (plan M, M15)
//
// When a session finishes a branch (merge, PR/MR creation, branch or worktree
// removal) and the SDD ledger carries `Ruling:`, `parked` or `minor (deferred)`
// lines, remind the agent to propose pattern entries from them before the
// explanation is lost. This lives in a hook on purpose: the natural home would
// be finishing-a-development-branch, which is an upstream file the fork keeps
// untouched.
//
// SDD deletes the plan workspace (ledger included) after the final review and
// BEFORE finishing the branch, so by merge time the live ledger is usually
// gone. Every Stop therefore snapshots ledgers that hold rulings into the git
// common dir (never tracked, shared by worktrees, survives `rm -rf <workspace>`);
// the reminder points at the live ledger when it still exists, else at the
// snapshot.
// ---------------------------------------------------------------------------

const LEDGER_ARCHIVE_DIR = 'superpowers-ledgers';
const LEDGER_ARCHIVE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const REFLOG_WINDOW_MS = 2 * 60 * 60 * 1000;

// Commands that close out a branch.
const FINISH_COMMAND_RE =
  /\bgit\s+(?:-C\s+\S+\s+)?merge\b(?!-)|\bgh\s+pr\s+(?:create|merge)\b|\bglab\s+mr\s+(?:create|merge)\b|\bgit\s+(?:-C\s+\S+\s+)?branch\s+-[dD]\b|\bgit\s+(?:-C\s+\S+\s+)?worktree\s+remove\b/;

function runGit(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0 || r.error) return '';
    return (r.stdout || '').trim();
  } catch {
    return '';
  }
}

/** Nearest directory at or above startDir that holds .superpowers/sdd, or null. */
function findSddRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, '.superpowers', 'sdd')).isDirectory()) return dir;
    } catch {
      // keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Ledger files: plan-scoped `<slug>/progress.md` plus legacy flat `progress*.md`. */
function listLedgers(sddDir) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(sddDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(sddDir, e.name);
    if (e.isFile() && /^progress.*\.md$/.test(e.name)) out.push(full);
    else if (e.isDirectory() && fs.existsSync(path.join(full, 'progress.md'))) {
      out.push(path.join(full, 'progress.md'));
    }
  }
  return out;
}

/**
 * Count ledger lines by kind. A `parked` line also carries `Ruling:`; it is
 * counted once, as parked, so the totals add up to distinct lines.
 */
function countLedgerRulings(content) {
  const counts = { rulings: 0, parked: 0, deferred: 0 };
  for (const line of (content || '').split('\n')) {
    if (/minor \(deferred\)/i.test(line)) counts.deferred++;
    else if (/:\s*parked\b/.test(line)) counts.parked++;
    else if (/Ruling:/.test(line)) counts.rulings++;
  }
  return counts;
}

function totalRulings(c) {
  return c.rulings + c.parked + c.deferred;
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** Archive dir for ledger snapshots, inside the git common dir of `root`. */
function getLedgerArchiveDir(root) {
  const common = runGit(['rev-parse', '--git-common-dir'], root);
  if (!common) return null;
  return path.join(path.resolve(root, common), LEDGER_ARCHIVE_DIR);
}

/** Snapshot name: the plan workspace slug, or the flat ledger's basename. */
function ledgerSnapshotName(ledgerPath) {
  const base = path.basename(ledgerPath);
  return base === 'progress.md' ? `${path.basename(path.dirname(ledgerPath))}.md` : base;
}

/**
 * Copy every live ledger that holds rulings into the archive (only when it
 * changed), and prune snapshots older than two weeks. Returns the live ledgers
 * with their counts.
 */
function snapshotLedgers(root, archiveDir, nowMs = Date.now()) {
  const live = [];
  for (const ledger of listLedgers(path.join(root, '.superpowers', 'sdd'))) {
    const content = readSafe(ledger);
    const counts = countLedgerRulings(content);
    if (totalRulings(counts) === 0) continue;
    live.push({ path: ledger, counts, mtimeMs: fs.statSync(ledger).mtimeMs });
    if (!archiveDir) continue;
    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      const dest = path.join(archiveDir, ledgerSnapshotName(ledger));
      if (readSafe(dest) !== content) fs.writeFileSync(dest, content);
    } catch {
      // A failed snapshot must never block Stop
    }
  }
  if (archiveDir) {
    try {
      for (const f of fs.readdirSync(archiveDir)) {
        const full = path.join(archiveDir, f);
        if (/\.md$/.test(f) && nowMs - fs.statSync(full).mtimeMs > LEDGER_ARCHIVE_MAX_AGE_MS) {
          fs.unlinkSync(full);
        }
      }
    } catch {
      // ignore
    }
  }
  return live;
}

/** Most recently touched snapshot with rulings, as { path, counts, mtimeMs }. */
function newestArchivedLedger(archiveDir) {
  let best = null;
  try {
    for (const f of fs.readdirSync(archiveDir)) {
      if (!/\.md$/.test(f)) continue;
      const full = path.join(archiveDir, f);
      const counts = countLedgerRulings(readSafe(full));
      if (totalRulings(counts) === 0) continue;
      const mtimeMs = fs.statSync(full).mtimeMs;
      if (!best || mtimeMs > best.mtimeMs) best = { path: full, counts, mtimeMs };
    }
  } catch {
    // no archive
  }
  return best;
}

/** Bash commands this session ran, read from the transcript (null if unreadable). */
function getSessionBashCommands(transcriptPath) {
  if (!transcriptPath) return null;
  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }
  const commands = [];
  for (const line of content.split('\n')) {
    if (!line.includes('tool_use')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const blocks =
      entry && entry.message && Array.isArray(entry.message.content)
        ? entry.message.content
        : Array.isArray(entry && entry.content) ? entry.content : [];
    for (const b of blocks) {
      if (b && b.type === 'tool_use' && b.input && typeof b.input.command === 'string') {
        commands.push(b.input.command);
      }
    }
  }
  return commands;
}

/**
 * True when this session closed out a branch. The transcript is the source of
 * truth; without one, fall back to a merge in the reflog within the last two
 * hours.
 */
function sessionFinishedBranch(data, cwd, nowMs = Date.now()) {
  const commands = getSessionBashCommands(data && data.transcript_path);
  if (commands) return commands.some(c => FINISH_COMMAND_RE.test(c));
  const reflog = runGit(['reflog', '-n', '30', '--format=%ct %gs'], cwd);
  return reflog.split('\n').some(line => {
    const m = line.match(/^(\d+) (merge\b|pull\b.*merge)/);
    return m && nowMs - Number(m[1]) * 1000 < REFLOG_WINDOW_MS;
  });
}

function toSlash(p) {
  return p.split(path.sep).join('/');
}

function buildLessonsReminder(ledger, projectName, pluginRoot) {
  const c = ledger.counts;
  return (
    `Lessons: this branch closes with ${c.rulings} \`Ruling:\` line(s), ${c.parked} \`parked\` and ` +
    `${c.deferred} \`minor (deferred)\` in the SDD ledger. Before ending, walk through them and ` +
    'propose (do not record) the entries that survive the error-recovery criterion: the pattern ' +
    'recurred in 2+ files or 2+ repositories, or review classified it as business-rule. Run:\n\n' +
    `  npx tsx ${toSlash(pluginRoot)}/tools/patterns/cli.ts record --from-review ${toSlash(ledger.path)} --project ${projectName}\n\n` +
    'What does not become an entry now never will: the ledger goes away with the plan workspace ' +
    'and the explanation lives only in your head.'
  );
}

/**
 * The lessons reminder for this Stop, or null. Snapshots ledgers as a side
 * effect (every Stop), and reminds at most once per session per ledger.
 */
function checkLessonsReminder(data, cwd, nowMs = Date.now()) {
  try {
    const root = findSddRoot(cwd);
    const gitRoot = root || cwd;
    const archiveDir = getLedgerArchiveDir(gitRoot);
    const live = root ? snapshotLedgers(root, archiveDir, nowMs) : [];
    // No SDD here and nothing archived: skip reading the transcript at all.
    if (live.length === 0 && !(archiveDir && fs.existsSync(archiveDir))) return null;

    if (!sessionFinishedBranch(data, cwd, nowMs)) return null;

    const ledger =
      live.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ||
      (archiveDir ? newestArchivedLedger(archiveDir) : null);
    if (!ledger) return null;

    // Once per session per ledger: the merge command stays in the transcript,
    // so without this every later Stop in the session would repeat it.
    if (archiveDir) {
      const sentFile = path.join(archiveDir, 'reminded.json');
      let sent = {};
      try {
        sent = JSON.parse(readSafe(sentFile) || '{}');
      } catch {
        sent = {};
      }
      const key = `${data.session_id || 'no-session'}:${ledgerSnapshotName(ledger.path)}`;
      if (sent[key]) return null;
      sent[key] = new Date(nowMs).toISOString();
      try {
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.writeFileSync(sentFile, JSON.stringify(sent));
      } catch {
        // ignore
      }
    }

    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
    return buildLessonsReminder(ledger, path.basename(gitRoot), pluginRoot);
  } catch {
    return null;
  }
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;

  try {
    const data = JSON.parse(input);
    process.stdout.write(JSON.stringify(evaluatePayload(data)));
  } catch {
    process.stdout.write('');
  }
}

/**
 * Build Claude Stop hook response object from input payload.
 * Only blocks Claude's stop when actionable reminders exist (TDD, commit,
 * decision log, session-log size). Informational stats alone do not block.
 */
function evaluatePayload(data) {
  if (!data || typeof data !== 'object') return {};

  const cwd = data.cwd || process.cwd();
  const sessionId = data.session_id || null;
  const edits = getRecentEdits(sessionId);

  // File-based guard prevents infinite loop for reminder injection
  if (!shouldFire()) {
    // Still snapshot SDD ledgers: a Stop that shows nothing must not skip it.
    const root = findSddRoot(cwd);
    if (root) snapshotLedgers(root, getLedgerArchiveDir(root));
    return {};
  }

  const reminders = generateReminders(edits, cwd);

  // Decision-log reminder: significant files modified since the last [saved] entry.
  // Using "since last saved" (not "last 30 min") means long sessions with multiple
  // work phases keep getting reminded until each phase is explicitly documented.
  const lastSavedTime = getLastSavedEntryTime();
  const editsSinceLastSaved = getEditsAfter(lastSavedTime, sessionId);
  if (isSignificantSession(editsSinceLastSaved)) {
    reminders.push(
      'Decision log: This session modified core skill/hook/config files. ' +
      'Before stopping, invoke context-management via the Skill tool to write a [saved] entry ' +
      'capturing decisions, rationale, and rejected approaches. ' +
      'Future sessions start with zero context — this is the only way to preserve the "why".'
    );
  }

  // state.md staleness: warn if state.md exists but source files changed after it was written
  const stateStaleness = checkStateMdStaleness(cwd, edits);
  if (stateStaleness) reminders.push(stateStaleness);

  // Session-log size guard: warn if last 2 [saved] entries exceed token budget
  const sizeWarning = checkSessionLogSize(cwd);
  if (sizeWarning) reminders.push(sizeWarning);

  // Lessons: branch finished with rulings left in the SDD ledger (M15)
  const lessons = checkLessonsReminder(data, cwd);
  if (lessons) reminders.push(lessons);

  if (reminders.length === 0) return {};

  // Stats-only sessions don't warrant blocking Claude's stop.
  // Only block when there are actionable reminders that need Claude's attention.
  // The stats summary is informational — it doesn't require a response from Claude.
  const hasActionableReminders = reminders.some(r => !r.startsWith('Session summary:'));
  if (!hasActionableReminders) return {};

  // Set guard BEFORE outputting — prevents re-entry
  setGuard();

  const context = [
    '<stop-hook-reminders>',
    ...reminders,
    '</stop-hook-reminders>',
  ].join('\n');

  return {
    decision: 'block',
    reason: context,
  };
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    buildLessonsReminder,
    checkLessonsReminder,
    countLedgerRulings,
    listLedgers,
    sessionFinishedBranch,
    snapshotLedgers,
    checkSessionLogSize,
    checkStateMdStaleness,
    evaluatePayload,
    generateReminders,
    getEditsAfter,
    getLastSavedEntryTime,
    getRecentEdits,
    isSourceFile,
    isTestFile,
    matchesSession,
    parseLogLine,
    setGuard,
    shouldFire,
  };
}
