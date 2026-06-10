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

- `enabled` — master switch.
- `level` — `standard` (current calibrated behavior) | `strict` | `carrasco` (default, uncompromising).
- `chunking` — `maxFilesPerChunk`, `maxLinesPerChunk`, `byTopic`. Chunking only kicks in when the change set exceeds a limit; otherwise all files are one chunk.
- `carrasco` — `redTeamParallel` (dispatch chunks in parallel), `requireReproducibleTrigger`, `focusCategories`, `severityThreshold` (BLOCK if any finding ≥ this).
- `standards` — `autoDetect` (read CLAUDE.md/AGENTS.md + neighboring code) and `paths` (authoritative standards/architecture docs to enforce).
- `reportOutput` — `saveToHarness`, `format` (`markdown` | `json` | `both`).

## Procedure

1. **Plan.** Run the harness CLI `review plan` (see *Running the CLI* below). It writes `.harness/reviews/<feature>/plan.json`, one prompt file per chunk under `prompts/`, and an empty `responses/` directory. Read `plan.json` to get the feature name and the chunk list. If it reports "No changed files", stop.

2. **Dispatch the carrascos.** For each chunk, read its prompt at `.harness/reviews/<feature>/prompts/<chunk-id>.md` and dispatch a `superpowers-prepared:carrasco` subagent with that prompt as its task.
   - **Dispatch all chunks in a SINGLE message** with multiple parallel Agent tool calls when `carrasco.redTeamParallel` is true (the default). Run sequentially only if it is false.
   - **Context isolation:** construct each subagent's prompt from the chunk prompt file ONLY. Never forward this session's history or other chunks' results.
   - Append to each subagent prompt: *"You are a focused subagent. Do NOT invoke any skills from the superpowers-prepared plugin. Do NOT use the Skill tool. Return your full report including the `<!-- REVIEWER_DECISION -->` JSON block."*

3. **Collect.** Write each subagent's returned text verbatim to `.harness/reviews/<feature>/responses/<chunk-id>.txt` (the chunk id matches the prompt filename).

4. **Aggregate.** Run the harness CLI `review aggregate --feature <feature>`. It parses every response, merges findings, decides the overall verdict against `severityThreshold`, and saves the consolidated report + `decision.json`. Exit code: `0` APPROVE, `2` BLOCK, `3` NEEDS_HUMAN_REVIEW.

5. **Report & act.**
   - Show the verdict and the report path (`.harness/reviews/<feature>/carrasco-review.md`).
   - On **BLOCK**: fix findings **ASI-first** (start from the report's "Fix First" entry), then re-run from step 1 — the diff changes, so a fresh review is required. Repeat until no finding reaches the threshold.
   - On **NEEDS_HUMAN_REVIEW**: surface the findings to your human partner for a decision; do not silently approve.

## Running the CLI

Use the harness CLI the same way as `harness-verify`, with the plugin-root env var for your harness:

- **Windows (PowerShell):** `npx tsx "$( $env:CLAUDE_PLUGIN_ROOT, $env:QWEN_PLUGIN_ROOT, $env:CURSOR_PLUGIN_ROOT, $env:CODEX_PLUGIN_ROOT | Where-Object { $_ } | Select-Object -First 1 )\tools\harness\cli.ts" review <plan|aggregate|gate-status> [--feature <name>] [--base <sha>] [--root <project>]`
- **Linux/macOS:** `npx tsx "${CLAUDE_PLUGIN_ROOT:-...}/tools/harness/cli.ts" review <subcommand> [...]`

If no plugin-root env var is set, resolve from the superpowers-prepared plugin directory (the parent of `hooks/`).

## Hard Rules

- Dispatch the carrascos from the planner's per-chunk prompts — do not hand-write the review criteria. The rigor (level, focus categories, standards enforcement, severity policy) is baked into those prompts from the config.
- Do not approve while the aggregate verdict is BLOCK. A passing run requires zero findings at or above `severityThreshold`.
- Do not edit files inside a carrasco subagent — carrascos review and report only. Fixes happen in the main session after aggregation.
- The verdict is tied to the exact change set (a fingerprint of the diff). If you change code after a passing review, the review is stale and must be re-run before the stop gate will pass.
