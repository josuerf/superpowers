#!/usr/bin/env node
/**
 * PostToolUse Hook (Bash) — SDD commit trailer reminder
 *
 * After a `git commit`, checks whether the commit came out of an SDD batch
 * (an active brief under .superpowers/sdd/) and, if so, whether its message
 * carries the `SDD-Plan:` trailer that writing-plans prescribes. When the
 * trailer is missing it returns a reminder as additional context — never a
 * block. Without the trailer the commit is invisible to tools/sdd-metrics,
 * and "which MRs went through SDD?" stays a guess.
 *
 * A brief is "active" when it is newer than the commit before this one, or
 * when its batch has no report yet (the implementer writes the report after
 * its commits, so a multi-commit batch stays active until it reports) and the
 * brief is less than a day old — an abandoned brief does not nag forever.
 *
 * The .superpowers/sdd/ directory is searched from the committing repo's root
 * upwards, so a commit inside a workspace's projects/<repo> still finds the
 * workspace-level SDD artifacts.
 *
 * Input:  stdin JSON with { tool_name, tool_input: { command }, cwd, ... }
 * Output: stdout JSON { hookSpecificOutput: { additionalContext } } or {}.
 * Fails open (prints {}) on any error.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// A commit whose HEAD is older than this was not made by the command that just
// ran (the commit failed, or it was a no-op) — do not remind about it.
const RECENT_COMMIT_MS = 2 * 60 * 1000;
// A brief with no report stops counting as active after this long.
const STALE_BRIEF_MS = 24 * 60 * 60 * 1000;

function git(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0 || r.error) return null;
    return (r.stdout || '').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

// `git`, any global options (-c k=v, -C <dir>, --no-pager, --git-dir=...),
// then `commit` as the SUBCOMMAND — so `git log --grep commit`, `git show --
// commit` and `git commit-tree` are not commits. Group 1 is the options run.
const GIT_OPT = String.raw`(?:-c\s+\S+|-C\s+(?:"[^"]+"|'[^']+'|\S+)|--[\w-]+(?:=\S+)?)`;
const GIT_COMMIT_SRC = String.raw`\bgit((?:\s+${GIT_OPT})*)\s+commit(?=$|[\s;&|])`;

/** True when the shell command runs `git commit` (not a dry run). */
function isGitCommitCommand(command) {
  if (typeof command !== 'string') return false;
  if (/--dry-run\b/.test(command)) return false;
  return new RegExp(GIT_COMMIT_SRC).test(command);
}

// Git Bash spells C:\Users as /c/Users; path.resolve on Windows would turn it
// into C:\c\Users. Convert the drive prefix before resolving.
function toNativePath(p) {
  if (process.platform !== 'win32') return p;
  const m = p.match(/^\/([a-zA-Z])(?:\/(.*))?$/);
  if (!m) return p;
  return path.win32.join(`${m[1].toUpperCase()}:/`, m[2] || '');
}

/**
 * Directory the commit ran in: `git -C <dir> commit`, or `cd <dir> && ... git
 * commit`, else the hook's cwd. Quotes around the directory are stripped.
 */
function resolveCommitDir(command, cwd) {
  const unquote = s => s.replace(/^["']|["']$/g, '');
  const commit = command.match(new RegExp(GIT_COMMIT_SRC));
  const dashC = commit && commit[1].match(/-C\s+("[^"]+"|'[^']+'|\S+)/);
  if (dashC) return path.resolve(cwd, toNativePath(unquote(dashC[1])));
  const cd = command.match(
    new RegExp(String.raw`(?:^|[;&|]\s*)cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)\s*&&[^;|\n]*?` + GIT_COMMIT_SRC),
  );
  if (cd) return path.resolve(cwd, toNativePath(unquote(cd[1])));
  return cwd;
}

/** Nearest .superpowers/sdd directory at or above startDir, or null. */
function findSddDir(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, '.superpowers', 'sdd');
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Brief files in the SDD dir: flat (legacy) and one level of plan workspaces. */
function listBriefs(sddDir) {
  const out = [];
  const scan = dir => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries;
  };
  for (const e of scan(sddDir)) {
    const full = path.join(sddDir, e.name);
    if (e.isFile() && /-brief\.md$/.test(e.name)) out.push(full);
    else if (e.isDirectory()) {
      for (const f of scan(full)) {
        if (f.isFile() && /-brief\.md$/.test(f.name)) out.push(path.join(full, f.name));
      }
    }
  }
  return out;
}

/**
 * The newest active brief, or null. `prevCommitMs` is the commit time of the
 * commit before the one just made (0 when there is none).
 */
function findActiveBrief(sddDir, prevCommitMs, nowMs) {
  let best = null;
  for (const brief of listBriefs(sddDir)) {
    let mtime;
    try {
      mtime = fs.statSync(brief).mtimeMs;
    } catch {
      continue;
    }
    const report = brief.replace(/-brief\.md$/, '-report.md');
    const inFlight = !fs.existsSync(report) && nowMs - mtime < STALE_BRIEF_MS;
    if (mtime > prevCommitMs || inFlight) {
      if (!best || mtime > best.mtime) best = { path: brief, mtime };
    }
  }
  return best ? best.path : null;
}

function hasSddTrailer(message) {
  return /^SDD-Plan:[ \t]*\S/m.test(message || '');
}

/** The plan path recorded by sdd-workspace next to the brief, if any. */
function readPlanPath(briefPath) {
  try {
    return fs.readFileSync(path.join(path.dirname(briefPath), 'plan-path'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function buildReminder(briefDisplay, planPath) {
  return [
    `This commit came out of an SDD batch (brief: ${briefDisplay})`,
    'and has no SDD-Plan trailer. Without the trailer this MR is invisible to',
    'process measurement — and the next question about "is SDD improving the',
    'code?" will have no way to be answered. Amend the commit (or add to the next one):',
    '',
    `  SDD-Plan: ${planPath || '<path to the plan>'}`,
    '  SDD-Task: <N>   (or SDD-Batch: <N>-<M>)',
  ].join('\n');
}

function evaluatePayload(data, nowMs = Date.now()) {
  if (!data || typeof data !== 'object') return {};
  if (data.tool_name && data.tool_name !== 'Bash') return {};
  const command = data.tool_input && data.tool_input.command;
  if (!isGitCommitCommand(command)) return {};

  const cwd = data.cwd || process.cwd();
  const commitDir = resolveCommitDir(command, cwd);
  const top = (git(['rev-parse', '--show-toplevel'], commitDir) || '').trim();
  if (!top) return {};

  const head = git(['log', '-1', '--format=%ct%n%B'], top);
  if (!head) return {};
  const nl = head.indexOf('\n');
  const headMs = Number(head.slice(0, nl)) * 1000;
  if (!headMs || nowMs - headMs > RECENT_COMMIT_MS) return {};
  if (hasSddTrailer(head.slice(nl + 1))) return {};

  const sddDir = findSddDir(top);
  if (!sddDir) return {};

  const prev = (git(['log', '-1', '--skip=1', '--format=%ct'], top) || '').trim();
  const prevMs = prev ? Number(prev) * 1000 : 0;
  const brief = findActiveBrief(sddDir, prevMs, nowMs);
  if (!brief) return {};

  const root = path.dirname(path.dirname(sddDir));
  const display = path.relative(root, brief).split(path.sep).join('/');
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: buildReminder(display, readPlanPath(brief)),
    },
  };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try {
    process.stdout.write(JSON.stringify(evaluatePayload(JSON.parse(input))));
  } catch {
    process.stdout.write('{}');
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    buildReminder,
    evaluatePayload,
    findActiveBrief,
    findSddDir,
    hasSddTrailer,
    isGitCommitCommand,
    listBriefs,
    resolveCommitDir,
    toNativePath,
  };
}
