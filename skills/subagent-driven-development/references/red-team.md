<!-- [fork] -->
# Red Team on Flagged Batches

Part of superpowers-prepared:subagent-driven-development. A task in the batch
carries `Risk flags` other than `none`.

When any task in the batch carries `Risk
flags` other than `none` (see writing-plans), dispatch
`superpowers-prepared:red-team` IN PARALLEL with the batch reviewer, on the
same review package, with the focus categories for the flag:

| Flag | Red-team focus categories |
|---|---|
| `security` | adversarial-inputs, assumption-violations |
| `concurrency` | concurrency-timing, state-corruption, error-cascading |
| `data-migration` | state-corruption, production-context-assumptions |
| `regulatory` | production-context-assumptions, assumption-violations |
| `backward-compat` | production-context-assumptions, error-cascading |

A Critical/High red-team finding enters the fix loop like any other. Category
8 of the red team (Production Context Assumptions, `agents/red-team.md`) is the
one that covers this fleet's dominant class — data-shape drift, contract drift,
deploy ordering, accumulated production state — and no other reviewer in the
fork has an equivalent. The harness path mirrors this table:
`review plan --plan-file <plan>` (`lib/harness/reviewers/red-team.ts`).
