# Harness Integration

Part of superpowers-prepared:subagent-driven-development. Read it before the first
dispatch.

Before dispatching any implementer subagent:

1. Invoke `extract-boundary` to gather minimal context for the batch's files, semantic understanding and project context. Scope it to the batch as a whole — the types and signatures its tasks share — not to each task separately; per-task extraction across a 6-task batch produces six overlapping envelopes and defeats the point.
2. Include in the implementer prompt: "After each change, run `npx tsx "${CLAUDE_PLUGIN_ROOT:-${QWEN_PLUGIN_ROOT:-${CURSOR_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-}}}}/tools/harness/cli.ts" local` to verify code quality and security issues." <!-- [fork] --> In a workspace harness (repositories under `projects/<repo>`), append `--root projects/<repo>` for the repository the task touches — otherwise the harness verifies the workspace root and reports 0% coverage.

### Pattern Injection
Include learned patterns in implementer and reviewer prompts:
- **Implementer**: Query patterns catalog for the task's module type, append `formatPatternsForContext(patterns)` output. Add: "⚠️ Known Patterns for this task: Apply these proactively."
- **Reviewer**: Append `formatPatternsForReview(patterns)` output. Add: "Verify implementation does NOT trigger known error patterns."

After all tasks (or all tasks in a wave) complete, run
`npx tsx "${CLAUDE_PLUGIN_ROOT:-${QWEN_PLUGIN_ROOT:-${CURSOR_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-}}}}/tools/harness/cli.ts" all` (verify-all,
plus <!-- [fork] --> `--root projects/<repo>` per touched repository in a workspace harness)
before the final review. If verify-all fails, delegate the fixes to the
relevant subagents; the per-batch review loop in SKILL.md is unchanged by it.
