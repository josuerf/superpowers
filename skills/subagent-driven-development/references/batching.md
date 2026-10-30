# Batching: the unit of dispatch is a batch, not a task

Part of superpowers-prepared:subagent-driven-development. Read it before you group
the plan's tasks, and again when you are tempted to split a batch.

**The default is one subagent per cohesive batch of tasks — not one per
task.** Read this file before dispatching anything; it decides how many
subagents the whole plan gets.

One-subagent-per-task is the most expensive way to run a plan and the
lowest-quality one. Measured on a 17-task plan, holding everything else
constant:

| Dispatch shape | Wall clock | Tokens | Quality |
|---|---|---|---|
| No subagents (all in the controller) | ~15–19 min | 9M | 0.93 |
| **One subagent per task** | **43 min** | **25M** | **0.81** |
| One per plan phase, unmerged | 35 min | 15M | 0.90 |
| **~3 batches of ~6 tasks** | **18 min** | **10M** | **0.95** |

Per-task dispatch lost on every axis at once, and for one reason: every
subagent starts empty. Each re-reads the brief, re-opens the same files, and
re-derives what its predecessor just built and threw away — so the reload is
paid per task instead of per batch — and each sees only a keyhole, so the
work fragments. The cost and the quality drop are the same defect, and more
review does not fix it.

Three batches match the no-subagent run on time and tokens at equal or
better quality, while leaving the controller's window about a quarter full
instead of three-quarters. That headroom is the compounding win: the
no-subagent run scores well one-shot but has nothing left for corrections,
and correcting on a full window is where cost and quality both collapse.

## Forming the batches

Target **3 batches** for a typical plan, adjusting only for size: aim for
4–8 tasks per batch, and let batch count grow past 3 only when 8-task
batches would not cover the plan. Below 4 tasks total, do not batch at
all — run them yourself in the controller.

That floor is a safeguard for direct invocation, not a second default
competing with the handoff. `superpowers-prepared:writing-plans` already
routes plans of 6 tasks or fewer to inline execution, so a plan arriving here
normally has enough tasks to batch. If one arrives below the floor anyway —
you were invoked directly, or your human partner overruled the handoff — run
it in the controller and say that is what you are doing.

Group by **cohesion**, in this order of preference:

1. **The plan's own phases**, when it has them — as a starting point, not a
   final answer. The plan author already grouped for cohesion; keep those
   boundaries, but **merge adjacent phases until each batch holds 4-8
   tasks**. Phases are written for readability and are often finer than a
   batch should be: the 0.90 row in the table above is exactly this
   mistake — taking a plan's existing phases as the dispatch unit without
   merging. Never split a phase across two batches; only merge whole
   phases, and only adjacent ones.
2. **Shared surface** — tasks touching the same module, the same layer, or
   the same set of files. These are the ones that most benefit from one
   subagent holding the whole picture.
3. **Sequence** — tasks where one produces what the next consumes. Splitting
   a producer from its consumer is what forces the reload that batching
   exists to avoid.

Two hard constraints on batch boundaries:

- **Never split a task across batches.** A task is atomic.
- **A batch must be independently verifiable** — it ends at a point where
  the suite can run and mean something.

Then check the batches for file overlap: batches that share no files and no
sequential dependency can be dispatched as one parallel wave (see
references/parallel-waves.md). Batching and waving are the same grouping pass — do it once.

Record the batch plan in the ledger before dispatching anything:
`Batch 1: Tasks 1-6 — <cohesion reason>`. It is what lets you resume after
compaction without re-deriving the grouping.

## When NOT to batch — and when not to delegate at all

Keep one dispatch per task when the task genuinely needs its own judgment,
its own tests, and its own review surface — a security-flagged task, a
subtle concurrency change, a task the pre-flight scan flagged as
conflicting. These are the minority. If you find yourself calling most of a
plan's tasks exceptional, you are rationalizing back into the 0.81 row.

And before delegating at all, apply the general test in
`superpowers-prepared:token-efficiency` → **Delegation Decision**: delegate
when the work fits a small contract, keep it in this session when it has one
owner and one acceptance test, and never delegate work whose contract would
require pasting half the repository.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "One subagent per task gives each one a cleaner context" | It gives each one a *narrower* context. Per-task dispatch measured slowest, costliest, and lowest-quality of every shape tested — 43 min / 25M / 0.81 against 18 min / 10M / 0.95 for three batches. |
| "These tasks are all a bit different, so each needs its own subagent" | Cohesion is not sameness — a batch is tasks that share a surface or a sequence, and holding several related tasks at once is exactly what produces the higher score. Most tasks in a plan are not exceptions. |
| "More subagents means more parallelism, so it's faster" | Only waves buy wall clock, and only for file-disjoint work. Splitting a batch to widen a wave adds a full context reload per piece and fragments the work — that is the 0.81 row. |
| "Batching will blow up the subagent's context window" | Four to eight cohesive tasks is well inside one window; the plan's own phase was already sized to be implemented together. If a batch genuinely does not fit, split it once — do not fall back to one per task. |

## Example

```
You: I'm using Subagent-Driven Development to execute this plan.

[Setup: worktree verified]
[Read plan file once: docs/superpowers-prepared/plans/feature-plan.md — 12 tasks, 5 phases]
[Resolve workspace: bash scripts/sdd-workspace docs/superpowers-prepared/plans/feature-plan.md — no ledger inside, fresh start]

[Group into batches — 5 phases is too fine; merge adjacent ones to 4-8 tasks each]
[Ledger: Batch 1: Tasks 1-4 — hook install surface (Phases 1+2 merged)]
[Ledger: Batch 2: Tasks 5-8 — recovery modes (Phase 3)]
[Ledger: Batch 3: Tasks 9-12 — docs and packaging (Phases 4+5 merged)]
[Batches 1 and 2 share src/hooks.js — sequential. Create 3 todos, one per batch]

Batch 1 (Tasks 1-4): Hook installation surface

[Run task-brief PLAN 1-4; dispatch ONE implementer with brief + report paths + context]
[Suggested skills: none — no UI or React in this batch]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/superpowers/hooks/)"

Implementer: [Later — receipt]
  Contract: batch-1-4-brief.md; files: src/install.js, src/hooks.js, test/install.test.js
  Status: DONE
  Files changed: src/install.js, src/hooks.js, test/install.test.js
  Files in contract NOT changed: none
  Commands run: npm test -- install (pass), npm run lint (pass)
  Commits: a1b2c3d install command, c3d4e5f --force flag
  Tests: 14/14 passing, output pristine
  Evidence: all four tasks land in one install path; self-review caught a
  missing --force flag, added and covered.

[Run review-package PLAN_FILE BASE HEAD; dispatch batch reviewer with the printed path]
Batch reviewer: Spec ✅ across Tasks 1-4. Task quality: Approved.
  Findings: 0 Critical, 0 Important, 1 Minor. Findings file: batch-1-4-review-1.md

[Ledger: Batch 1 (Tasks 1-4): complete (commits a1b2c3d..c3d4e5f, review clean)]
[Ledger: Batch 1: minor (deferred): naming nit in install.js]
[Tick plan checkboxes for Tasks 1, 2, 3 and 4 — all four, not just the first]

Batch 2 (Tasks 5-8): Recovery modes

[Run task-brief PLAN 5-8; dispatch ONE implementer]

Implementer: [No questions — receipt]
  Status: DONE
  Files changed: src/recovery.js, test/recovery.test.js
  Files in contract NOT changed: none
  Commands run: npm test -- recovery (pass)
  Commits: d4e5f6a verify/repair modes
  Tests: 8/8 passing

[Run review-package PLAN_FILE BASE HEAD; dispatch batch reviewer]
Batch reviewer: Spec ❌ — Task 7 missing progress reporting
  (spec says "report every 100 items"). 0 Critical, 2 Important.
  Findings file: batch-5-8-review-1.md

[Fix round 1: resume the implementer with the findings FILE PATH, not the findings]
Implementer: Added progress reporting, extracted PROGRESS_INTERVAL constant.
  Re-ran test/recovery.test.js — 10/10 passing. Fix report appended.

[Run review-package PLAN_FILE FIX_BASE HEAD; dispatch scoped re-review with the findings path]
Re-reviewer: Missing progress reporting — ADDRESSED (src/recovery.js:41).
  Magic number — ADDRESSED (src/recovery.js:7). New breakage: none.
  Verdict: all findings addressed.

[Ledger: Batch 2: fix round 1/3 (2 addressed, 0 open; commits d4e5f6a..b7c8d9e)]
[Ledger: Batch 2 (Tasks 5-8): complete (commits d4e5f6a..b7c8d9e, review clean)]
[Tick plan checkboxes for Tasks 5, 6, 7 and 8]

...

[After all batches]
[Run review-package PLAN_FILE MERGE_BASE HEAD; dispatch final code-reviewer, most capable model]
Final reviewer: All requirements met. Deferred minors triaged: none block merge.

[Delete this plan's workspace — the record now lives in git]

Done! Using superpowers-prepared:finishing-a-development-branch.
```

Note the shape: 12 tasks became **3 implementer dispatches**, not 12 — and
5 plan phases were merged down to 3 batches rather than dispatched as-is.
That is the whole difference between the 0.95 row and the 0.81 row.
