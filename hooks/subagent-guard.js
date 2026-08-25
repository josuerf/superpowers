#!/usr/bin/env node
/**
 * Subagent Guard — SubagentStop Hook
 *
 * Detects when subagents invoke superpowers-prepared *process* skills or
 * spawn recursive sub-subagents. When detected, blocks the subagent from
 * stopping and instructs it to redo its work without those invocations.
 *
 * SCOPE — read before adding a name to PROCESS_SKILLS.
 * The thing being prevented is a focused implementer turning itself into a
 * workflow orchestrator: re-planning, re-brainstorming, dispatching its own
 * reviewers, re-entering the very pipeline that dispatched it. That is what
 * a *process* skill does. It is NOT a goal of this hook to stop a subagent
 * from consulting domain knowledge while it implements.
 *
 * Therefore this guard blocks ONLY the names in PROCESS_SKILLS. It does not
 * block, and must never block:
 *   - implementation-support skills from this plugin (see ALLOWED_SKILLS) —
 *     they carry domain knowledge, not workflow control;
 *   - skills defined by the user's project or workspace — they are outside
 *     this plugin's authority entirely, and a subagent that needs the
 *     project's own conventions must be able to load them.
 *
 * This is the "locked door" layer of defense — prompt-based instructions
 * are the first layer; this hook catches violations that slip through.
 *
 * Logs violations to: ~/.claude/hooks-logs/subagent-violations.jsonl
 */

const fs = require('fs');
const path = require('path');

// Patterns that indicate a subagent invoked a process skill or spawned
// sub-subagents. Each pattern requires an action verb (invoke/invoking/using/
// use/run/running/called/calling) immediately before the skill reference so
// that bare mentions in file content or code comments do not trigger false
// positives.
//
// PROCESS_SKILLS: workflow-control skills. A subagent invoking one of these
// is stepping outside its contract and becoming an orchestrator.
const PROCESS_SKILLS = [
  'using-superpowers',
  'brainstorming',
  'deliberation',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'systematic-debugging',
  'test-driven-development',
  'verification-before-completion',
  'token-efficiency',
  'context-management',
  'dispatching-parallel-agents',
  'requesting-code-review',
  'receiving-code-review',
  'carrasco-review',
  'finishing-a-development-branch',
  'error-recovery',
  'extract-boundary',
  'claude-md-creator',
  'self-consistency-reasoner',
  'using-git-worktrees',
  'premise-check',
  'red-team',
  'refactoring',
  'performance-investigation',
  'dependency-management',
  'writing-skills',
  'harness-verify',
];

// ALLOWED_SKILLS: implementation-support skills from this plugin that a
// subagent MAY invoke. These carry domain knowledge (how to write a good
// React component, how to structure accessible UI) rather than workflow
// control, so loading one keeps the subagent inside its contract instead of
// pulling it out. Deliberately excluded from PROCESS_SKILLS — do not "fix"
// their absence by adding them there.
//
// Skills belonging to the user's project or workspace are also allowed and
// are not enumerated here: anything not in PROCESS_SKILLS passes.
const ALLOWED_SKILLS = [
  'frontend-design',
  'vercel-react-best-practices',
];

const ACTION_VERB = '(?:invoking?|using|use|running?|called?|calling|activat(?:e|ed|ing)|trigger(?:ing|ed)?|execut(?:e|ed|ing)|launch(?:ing|ed)?|spawn(?:ing|ed)?|start(?:ing|ed)?)\\s+(?:the\\s+)?';

// Derived from PROCESS_SKILLS so the name list stays the single source of
// truth. A previous version hardcoded a second copy of the list here and the
// two drifted apart.
// Names that are also ordinary English words. Matching these on an action
// verb alone fires on normal prose — "I started refactoring the auth module"
// is a status report, not a skill invocation, and blocking it forces a whole
// batch to be redone. These require the word "skill" after the name.
const PROSE_WORD_SKILLS = new Set(['refactoring', 'deliberation']);

const PROCESS_SKILL_ALTERNATION = PROCESS_SKILLS.join('|');
const ALLOWED_SKILL_ALTERNATION = ALLOWED_SKILLS.join('|');
// Built with String.raw so the regex source needs no backslash doubling.
const SKILL_REF = String.raw`["']?(?:superpowers[\w-]*:)?`;

const VIOLATION_PATTERNS = [
  // Negative lookahead: an allowed skill named right after the plugin
  // prefix is not a violation. Without it this pattern blocked
  // "Invoke the superpowers-prepared frontend-design skill".
  new RegExp(String.raw`Invoke the superpowers-prepared(?!\s+(?:` + ALLOWED_SKILL_ALTERNATION + '))', 'i'),
  // Scoped to process skills only. This slot used to hold
  // /I'm using the .+ skill/i, whose `.+` matched ANY skill name — including
  // the user's own project skills, which this hook has no business blocking.
  new RegExp("I'm using the (?:" + PROCESS_SKILL_ALTERNATION + ") skill", 'i'),
  new RegExp(String.raw`Skill\s*\(\s*` + SKILL_REF + '(?:' + PROCESS_SKILL_ALTERNATION + ')', 'i'),
  new RegExp(String.raw`skill:\s*` + SKILL_REF + '(?:' + PROCESS_SKILL_ALTERNATION + ')', 'i'),
  ...PROCESS_SKILLS.map(name => new RegExp(
    ACTION_VERB + name + (PROSE_WORD_SKILLS.has(name) ? '\\s+skill' : ''),
    'i'
  )),
];

function logViolation(agentId, agentType, matchedPattern) {
  try {
    const logDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'hooks-logs');
    fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(logDir, 'subagent-violations.jsonl');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      agentId,
      agentType,
      matchedPattern: matchedPattern.toString(),
      action: 'blocked'
    }) + '\n';

    fs.appendFileSync(logFile, entry);
  } catch (_) {
    // Logging must never break the hook
  }
}

function main() {
  let input = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const lastMessage = data.last_assistant_message || '';
      const agentId = data.agent_id || 'unknown';
      const agentType = data.agent_type || 'unknown';

      // Check if the subagent's output shows evidence of skill invocation
      for (const pattern of VIOLATION_PATTERNS) {
        if (pattern.test(lastMessage)) {
          logViolation(agentId, agentType, pattern);

          // Block the subagent from stopping — force it to redo without skills
          const result = {
            decision: 'block',
            reason: [
              'PROCESS SKILL LEAKAGE DETECTED: you invoked a superpowers-prepared *process* skill (a workflow-control skill such as brainstorming, writing-plans, subagent-driven-development, or a code-review pipeline). Subagents may not re-enter the workflow that dispatched them.',
              'Redo your assigned task without that skill.',
              'To be clear about what IS allowed, so you do not over-correct: you may use your core tools freely, you may invoke skills defined by this project or workspace, and you may invoke the implementation-support skills ' + ALLOWED_SKILLS.join(' and ') + ' when they apply to the work. Only the process skills are off-limits.',
              'Focus only on the task you were given.'
            ].join(' ')
          };

          process.stdout.write(JSON.stringify(result));
          return;
        }
      }

      // No violation — allow subagent to stop normally
      process.stdout.write('');
    } catch (_) {
      // Parse failure — allow stop (never break the pipeline)
      process.stdout.write('');
    }
  });
}

main();
