#!/usr/bin/env node
/**
 * PreToolUse Hook (Task|Agent) — Harness context, by path
 *
 * Before the controller dispatches a subagent, points it at the workspace's
 * harness knowledge files that exist — known-issues.md section 1 (verified
 * platform traps), architecture/ownership-map.md and similar maps — so the
 * dispatch carries them. Only PATHS are injected, never contents: the fork's
 * rule is "paths, never pasted contents", and a subagent reads what applies
 * to its own files.
 *
 * This matters most for dispatches that do not go through an SDD brief
 * (direct implementation, the brainstorming `bounded` path); a brief already
 * carries most of this.
 *
 * OPT-IN: acts only when the nearest .harness.config.json (at or above cwd)
 * sets `injectHarnessContext.enabled: true`. Default off. The list of files
 * can be replaced with `injectHarnessContext.paths` (relative to the config's
 * directory). Paths the dispatch prompt already names are not repeated.
 *
 * Delivery — what actually happens: on PreToolUse, `additionalContext` is
 * added to the CONTROLLER's context alongside the tool result (Claude Code
 * hooks reference, PreToolUse decision control), i.e. after the subagent ran
 * with its original prompt. The text says so, and asks the controller to
 * carry the paths into its next dispatches. Rewriting the prompt through
 * `updatedInput` was considered and rejected: the reference documents it only
 * paired with permissionDecision "allow"/"ask" (a hook must never approve a
 * permission), and matching hooks run in parallel with no documented merge
 * rule for competing updatedInput values.
 *
 * Input:  stdin JSON with { tool_name, tool_input: { prompt }, cwd, ... }
 * Output: stdout JSON { hookSpecificOutput: { hookEventName: "PreToolUse",
 *         additionalContext } } or {}. Never allows/denies — no decision.
 *         Fails open (prints {}) on any error.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PATHS = [
  { rel: 'known-issues.md', note: 'section 1: verified platform traps' },
  { rel: 'architecture/ownership-map.md', note: 'who owns what' },
  { rel: 'architecture/integration-map.md', note: 'cross-repo calls' },
  { rel: 'architecture/platform-model.json', note: 'platform facts behind known-issues section 1' },
];

/** Nearest .harness.config.json at or above startDir, parsed, or null. */
function findHarnessConfig(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const file = path.join(dir, '.harness.config.json');
    if (fs.existsSync(file)) {
      try {
        return { dir, config: JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch {
        return null; // malformed config: stay off
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isEnabled(config) {
  return !!(config && config.injectHarnessContext && config.injectHarnessContext.enabled === true);
}

/** Configured or default candidates that exist, as { abs, rel, note }. */
function resolveContextPaths(root, config) {
  const custom = config && config.injectHarnessContext && config.injectHarnessContext.paths;
  const candidates = Array.isArray(custom)
    ? custom.filter(p => typeof p === 'string' && p.length > 0).map(rel => ({ rel, note: '' }))
    : DEFAULT_PATHS;
  const out = [];
  for (const c of candidates) {
    const abs = path.resolve(root, c.rel);
    // Stay inside the workspace: a config must not point dispatches elsewhere.
    const inside = path.relative(root, abs);
    if (inside.startsWith('..') || path.isAbsolute(inside)) continue;
    if (fs.existsSync(abs)) out.push({ abs, rel: c.rel, note: c.note });
  }
  return out;
}

function toSlash(p) {
  return p.split(path.sep).join('/');
}

function evaluatePayload(data) {
  if (!data || typeof data !== 'object') return {};
  if (data.tool_name && !/^(Task|Agent)$/.test(data.tool_name)) return {};

  const found = findHarnessConfig(data.cwd || process.cwd());
  if (!found || !isEnabled(found.config)) return {};

  const toolInput = data.tool_input && typeof data.tool_input === 'object' ? data.tool_input : {};
  const prompt = String(toolInput.prompt || '');
  const paths = resolveContextPaths(found.dir, found.config).filter(
    p => !prompt.includes(p.rel) && !prompt.includes(toSlash(p.abs)),
  );
  if (paths.length === 0) return {};

  const lines = [
    '<harness-context>',
    'This workspace keeps harness knowledge files. These are paths for the controller to include in the dispatch',
    '(paths only, never contents). This note reaches you with the tool result, so the subagent just dispatched',
    'did not see it: put these paths in the next dispatch prompts, and follow up with this one if its work touched them.',
    ...paths.map(p => `- ${toSlash(p.abs)}${p.note ? ` — ${p.note}` : ''}`),
    '</harness-context>',
  ];
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: lines.join('\n'),
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
  module.exports = { evaluatePayload, findHarnessConfig, isEnabled, resolveContextPaths };
}
