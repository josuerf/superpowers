---
name: carrasco-review
description: >
  Rigorous, uncompromising code review driven by the harness. Plans the
  review (chunking changed files by topic when there are many), dispatches
  one aggressive "carrasco" subagent per chunk in parallel to enforce the
  project's established standards and the active technology rules, then
  aggregates the verdicts into a blocking report under .harness/reviews/.
  Triggers on: "carrasco review", "rigorous review", "strict code review",
  "review hard", "review my changes against our standards". Also used by the
  stop gate (verify-on-stop) and routed from requesting-code-review when a
  hard standards-enforcing pass is wanted.
---

# Carrasco Review

The harness reviews code **by technology** and saves the result under `.harness/reviews/`. This skill makes that review rigorous: it enforces the project's established standards as hard requirements and uses aggressive subagents (carrascos) — one per chunk of changed files — that respect the host workspace's architecture. Everything is configured via `.harness.config.json` (`reviewAggressiveness`).

## Required Start

Announce: `I'm running the carrasco-review skill.`

## Configuration (`.harness.config.json` → `reviewAggressiveness`)

- `enabled` — master switch. Defaults to `false`: this skill only runs the automated Stop-hook gate when a project opts in via `.harness.config.json`. Invoking the skill directly (e.g. "carrasco review") always works regardless of this flag.
- `level` — `standard` (default, current calibrated behavior) | `strict` | `carrasco` (uncompromising — every finding treated as blocking).
- `chunking` — `maxFilesPerChunk`, `maxLinesPerChunk`, `byTopic`. Chunking only kicks in when the change set exceeds a limit; otherwise all files are one chunk.
- `carrasco` — `redTeamParallel` (dispatch chunks in parallel), `requireReproducibleTrigger`, `focusCategories`, `severityThreshold` (BLOCK if any finding ≥ this).
- `standards` — `autoDetect` (read CLAUDE.md/AGENTS.md + neighboring code) and `paths` (authoritative standards/architecture docs to enforce).
- `reportOutput` — `saveToHarness`, `format` (`markdown` | `json` | `both`).

## Procedure

1. **Plan.** Run the harness CLI `review plan` (see *Running the CLI* below). It writes `.harness/reviews/<feature>/plan.json`, one prompt file per chunk under `prompts/`, and an empty `responses/` directory. Read `plan.json` to get the feature name and the chunk list. If it reports "No changed files", stop.

2. **Dispatch the carrascos.** For each chunk, read its prompt at `.harness/reviews/<feature>/prompts/<chunk-id>.md` and dispatch a `superpowers-prepared:carrasco` subagent with that prompt as its task.
   - **Dispatch all chunks in a SINGLE message** with multiple parallel Agent tool calls when `carrasco.redTeamParallel` is true (the default). Run sequentially only if it is false.
   - **Context isolation:** construct each subagent's prompt from the chunk prompt file ONLY. Never forward this session's history or other chunks' results.
   - Append to each subagent prompt: *"You are a focused subagent. Do NOT invoke superpowers-prepared process skills (workflow-control skills such as brainstorming, writing-plans, subagent-driven-development, or any code-review pipeline including this one) and never dispatch a subagent of your own. Skills defined by this project or workspace are allowed. Return your full report including the `<!-- REVIEWER_DECISION -->` JSON block."*

3. **Collect.** Write each subagent's returned text verbatim to `.harness/reviews/<feature>/responses/<chunk-id>.txt` (the chunk id matches the prompt filename).

4. **Aggregate.** Run the harness CLI `review aggregate --feature <feature>`. It parses every response, merges findings, decides the overall verdict against `severityThreshold`, and saves the consolidated report + `decision.json`. Exit code: `0` APPROVE, `2` BLOCK, `3` NEEDS_HUMAN_REVIEW.

5. **Report & act.**
   - Show the verdict and the report path (`.harness/reviews/<feature>/carrasco-review.md`).
   - On **BLOCK**: fix findings **ASI-first** (start from the report's "Fix First" entry), then re-review with `review recheck` (step 6 below) — never re-run from step 1. Repeat until no finding reaches the threshold,
     **for at most three rechecks** — see Hard Rules.
   - On **NEEDS_HUMAN_REVIEW**: surface the findings to your human partner for a decision; do not silently approve.

6. **Recheck (after fixing findings) — scoped, not a full re-plan.** Run
   `review recheck --feature <feature>` (add `--note "<one line: what you
   changed, plus any new follow-up ask from your human partner>"`; add
   `--chunks id-a,id-b` only if you want to target specific chunks instead of
   the default of every chunk that didn't approve). This does **not**
   recompute the whole plan:
   - It reads the last decision's per-chunk verdicts and, for each chunk that
     didn't approve, writes a new prompt containing only that chunk's prior
     findings, the diff of just that chunk's files since the last review (the
     fix — not the original diff again), and your note.
   - Chunks that already approved are left untouched — their prompt and
     response files are not regenerated.
   - Dispatch one `superpowers-prepared:carrasco` subagent per chunk printed
     by `recheck`, exactly as in step 2, then write each response to the same
     `responses/<chunk-id>.txt` path.
   - Run `review aggregate --feature <feature>` again — it merges the fresh
     verdicts for rechecked chunks with the untouched ones automatically, no
     extra flag needed.

## Running the CLI

Use the harness CLI the same way as `harness-verify`, with the plugin-root env var for your harness:

- **Windows (PowerShell):** `npx tsx "$( $env:CLAUDE_PLUGIN_ROOT, $env:QWEN_PLUGIN_ROOT, $env:CURSOR_PLUGIN_ROOT, $env:CODEX_PLUGIN_ROOT | Where-Object { $_ } | Select-Object -First 1 )\tools\harness\cli.ts" review <plan|recheck|aggregate|gate-status> [--feature <name>] [--base <sha>] [--chunks <id,id>] [--note "<text>"] [--root <project>]`
- **Linux/macOS:** `npx tsx "${CLAUDE_PLUGIN_ROOT:-...}/tools/harness/cli.ts" review <subcommand> [...]`

If no plugin-root env var is set, resolve from the superpowers-prepared plugin directory (the parent of `hooks/`).

## Hard Rules

- Dispatch the carrascos from the planner's per-chunk prompts — do not hand-write the review criteria. The rigor (level, focus categories, standards enforcement, severity policy) is baked into those prompts from the config.
- Do not approve while the aggregate verdict is BLOCK. A passing run requires zero findings at or above `severityThreshold`.
- Do not edit files inside a carrasco subagent — carrascos review and report only. Fixes happen in the main session after aggregation.
- The Stop-hook gate's verdict is tied to the exact change set (a whole-diff fingerprint). If you change code after a passing review, the gate treats it as stale.
- **At most three rechecks.** Each recheck re-dispatches one carrasco per
  unapproved chunk, so an uncapped loop multiplies review seats without
  bound — and findings that survive three fix attempts are not converging.
  When the third recheck still blocks, stop dispatching and adjudicate the
  remaining findings yourself: fix what is load-bearing, and record the rest
  in the report with an explicit ruling on why the code stands. Escalate to
  your human partner rather than starting a fourth round.
- After a BLOCK, do not re-run `review plan` from scratch and do not re-dispatch carrascos for chunks that already approved. Use `review recheck` (step 6) so only the chunks that had findings are re-reviewed, with a lean prompt (their prior findings + the fix diff + your note) instead of the full original chunk context.
