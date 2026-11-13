---
name: error-recovery
description: >
  Maintains a project-specific known-issues.md mapping recurring errors
  to their solutions. Consulted automatically by systematic-debugging
  before investigation. Saves time by avoiding rediscovery of known
  problems across sessions. Triggers on: "save this fix", "remember
  this error", "known issues", or automatically when systematic-debugging
  resolves a recurring error.
---

# Error Recovery Intelligence

Maintain a project-level error→solution mapping to avoid rediscovering known problems.

## File Location

`known-issues.md` at the project root (same level as `package.json`, `Cargo.toml`, etc.).

**Layout by repository (when a `known-issues/` folder exists next to it):**
`known-issues.md` is then only the root index (globals plus one line per repo).
The entries live in `known-issues/_global/<area>.md` (applies to 2+ repos or to
the platform) and `known-issues/<repo>/<area>.md`; each repo folder has an
`INDICE.md` (one line per entry). `known-issues/_arquivo.md` is the cold layer:
read it only when nothing else matches. Never edit an `INDICE.md` or the root
index by hand.

## When to Consult

Before starting any debugging investigation:
1. Check if `known-issues.md` exists.
2. Search it for the error message, error code, or failing test name.
3. If a match is found, try the documented solution first before full investigation.

With the folder layout, read the root index, then the `INDICE.md` of the repo
you are working in (`projects/<repo>`), then open only the matching area file.

## When to Update

After resolving a bug that is likely to recur:
- Environment-dependent errors (missing services, port conflicts, env vars)
- Configuration errors (wrong versions, missing dependencies, build flags)
- Test failures caused by external state (database needs seeding, service needs starting)
- Platform-specific issues (Windows vs. Unix path handling, line endings)
- Errors that took significant investigation to diagnose

**Also record a logic bug** once it has stopped being one-off: the same error
pattern recurred — 2+ occurrences across distinct MRs, files, or repositories,
or reported by 2+ authors — or the review classified it as `business-rule`.
At that point it is not an isolated bug, it is a trap in the domain — and the
commit message, which is where your explanation lives today, will never be
read by whoever edits the neighboring file next month.

**Do NOT record:**
- A genuinely isolated logic bug: one occurrence, one file, one repository, low blast radius, no pattern — a one-off that does not recur
- Errors already documented in the project's README or docs
- Transient network/API failures

## Entry Format

Each entry must be concise and actionable:

```markdown
## [Short description]

**Error:** `exact error message or pattern`
**Cause:** One sentence explaining why this happens.
**Fix:**
```bash
exact command or steps to resolve
```
**Context:** When this typically occurs (e.g., "after fresh clone", "on Windows", "when DB is not running").
```

## Entry Format (layout by repository)

Write the entry into the area file of the repo (`known-issues/<repo>/<area>.md`,
or `_global/` when it applies to 2+ repos), at most 6 lines:

```markdown
### <slug>  hits:N  seen:YYYY-MM  last:YYYY-MM  raio:alto|medio|baixo
**Resumo:** <up to 90 characters; becomes the index line>
**Sintoma:** ... **Causa:** ... **Solução:** ...
```

The slug is lowercase with hyphens and unique in the whole `known-issues/` tree.
If the issue already exists, raise `hits` and `last` instead of duplicating it.
Afterwards, if `scripts/known-issues.js` exists, run
`node scripts/known-issues.js indice` to regenerate the indexes, and
`node scripts/known-issues.js validar` to check budgets (index 4 KB per repo,
area file 8 KB, root 8 KB). If the script does not exist, leave the indexes alone.

## File Management

- Single-file layout: keep `known-issues.md` under 50 entries. If it grows beyond that, prune entries that haven't been relevant in months.
- Group entries by category (Environment, Dependencies, Tests, Build, Platform).
- When a known issue is permanently fixed (e.g., the root cause was removed from the codebase), delete the entry.

## Integration

- `systematic-debugging` consults this file in Phase 1 (Investigate) before generating hypotheses.
- `using-superpowers` reads this file during the entry sequence when it exists.
- After resolving a debugging session, offer to add the error→solution mapping if it meets the "When to Update" criteria.
