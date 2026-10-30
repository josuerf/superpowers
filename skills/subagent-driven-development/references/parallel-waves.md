# Parallel Waves (for file-disjoint batches)

Part of superpowers-prepared:subagent-driven-development.

The task loop in SKILL.md is sequential by default. When several **batches** are
independent AND touch disjoint files with no shared state, dispatch them as
one wave instead — the qualified exception to the never-parallelize rule,
and the preferred mode whenever the batches actually qualify.

Waves and batches are two axes of the same grouping pass, and they do
different work: **batching decides how many subagents exist** (and is what
drives cost and quality); **waving decides when they run** (and buys wall
clock only). Do the grouping once, in references/batching.md, and read off
both answers — never re-group here.

**Decision rule:** after forming batches, check them for file overlap and
state dependency. Start from what the plan already declares — a phase whose
`Depends on:` is `none` does not need the phase before it — then confirm
against actual file overlap, which is the binding test. Batches with no
shared files and no sequential dependency belong in the same wave. Any overlap or shared-state risk moves the
conflicting batch to the next wave — when in doubt, keep it sequential.

1. Build a wave of independent batches.
2. Dispatch all implementers in a **single message** with multiple parallel Agent tool calls. Do not stagger across multiple messages.
3. Each batch in the wave keeps its own brief, report, review, and fix loop — the wave changes dispatch timing, nothing else. It does not merge two batches' reviews, and it does not license splitting a batch back into per-task dispatches to widen the wave: a wider wave of smaller pieces is the 0.81 row.
4. Run integration verification (verify-all) after the wave completes.
5. Append each batch's completion line to the ledger and update the plan checkboxes for every task it covered.
6. Proceed to the next wave.

**Why single-message dispatch matters for cost:** All subagents share the same cached system prompt prefix. Dispatching them simultaneously in one message means every agent gets a cache hit on that prefix and only pays for its small unique task prompt. Staggered dispatch provides no additional benefit and wastes wall-clock time.
