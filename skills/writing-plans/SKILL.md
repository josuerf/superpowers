---
name: writing-plans
description: >
  MUST USE after design approval to decompose requirements into executable
  task plans with verification commands and TDD ordering. Triggers on:
  "write a plan", "break this down", "plan the implementation", after
  brainstorming approval. Routed by brainstorming as the next step.
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers-prepared:using-git-worktrees` skill at execution time.

## Output Path

Save to `docs/superpowers-prepared/plans/YYYY-MM-DD-<feature-name>.md`.
- User preferences for plan location override this default.

## Plan Header

```markdown
# <Feature Name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task with superpowers-prepared:subagent-driven-development (one subagent per cohesive batch) or superpowers-prepared:executing-plans (inline, in one context). The plan author picked one at the handoff and said why; that choice stands unless the human partner changes it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** <single sentence>
**Architecture:** <2-4 sentences>
**Tech Stack:** <languages/libraries/tools>
**Assumptions:** <list the key assumptions this plan rests on. For each, state what it excludes: "Assumes X — will NOT work if Y."> *(skip only if the plan contains zero conditional logic)*

---
```

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- Prefer smaller, focused files over large ones that do too much — you reason best about code you can hold in context at once, and your edits are more reliable when files are focused.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure — but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Grouping Tasks Into Phases

Group the plan's tasks into **phases**: cohesive sets of tasks that are
implemented and verified together. Phases are how the plan tells its
executor what may be done as one unit of work.

This matters because of how plans get executed. `subagent-driven-development`
dispatches one subagent per *batch* of tasks, and your phases are the first
input it uses to form those batches — measured on a 17-task plan, one
subagent per task ran 2.4× slower, cost 2.5× more, and scored *worse*
(0.81 vs 0.95) than three cohesive batches, because every extra subagent
re-reads the same context and sees a narrower slice of the whole. A plan
with no phases forces its executor to invent the grouping from the outside,
with less information than you have right now.

**Aim for around 3 phases**, 4–8 tasks each. Let the count grow past 3 only
when 8-task phases would not cover the plan. A plan under 4 tasks needs no
phases.

Group by cohesion — same module or layer, or a producer and the tasks that
consume it. Two constraints:

- A task belongs to exactly one phase.
- A phase ends where the suite can run and mean something.

State each phase's dependency explicitly, so the executor can tell which
phases may run concurrently without re-deriving it from the task text.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Bite-Sized Task Granularity

- Keep tasks independent when possible.
- Keep each step to one action (roughly 2-5 minutes).
- Use exact file paths.
- Include exact verification commands and expected outcomes.
- Use TDD ordering when code behavior changes.
- For ambiguous features, ask clarifying questions before finalizing the plan rather than guessing.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement this plan task-by-task with superpowers-prepared:subagent-driven-development (one subagent per cohesive batch) or superpowers-prepared:executing-plans (inline, in one context). The plan author picked one at the handoff and said why; that choice stands unless the human partner changes it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec/design doc this plan implements — the plan
argues from the spec, so the spec travels with it; executors read both]

**Laudo:** [path to incidents/<KEY>-laudo.md when this plan was born from an
incident, or "n/a". The laudo carries the root cause with evidence (§3), the
impact and radius matrix (§5), and the proposal this plan implements (§6). A
fix plan without its laudo is a plan rediscovering the cause.] <!-- [fork] -->

**Harness:** [the workspace documents this plan must respect, one per line:
architecture/ownership-map.md, decisions/ADR-NNN.md, catalog/<service>.md,
engineering/<area>/conventions.md, known-issues.md §1. Paths, never contents.
"none" is acceptable only when you checked and there are none.] <!-- [fork] -->

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

<!-- [fork] -->
## Blast Radius

[One row per symbol, table, column, endpoint, event, queue, or file this
plan changes or removes:]

| What changes | Who consumes it today | How it was verified (command) | Result | What happens to the consumer |
|---|---|---|---|---|

[Required method — record the command AND the result count. Use the best
search the session has, in this order: the forge MCP tools
(`forge_siblings(symbol)`, `forge_locate(term)`) when that server is
available; else the workspace's `node scripts/search.js [-i] --json --repos
<list> "<term>"` when the workspace has it (multi-repo, count per repo);
else grep:
- `grep -rn "<symbol>"` across ALL repositories of the workspace, not only
  the one you are changing.
- `grep -rn "<table>\|<column>"` in native `@Query`s, mappers, and
  migration scripts.
- `grep -rn "<endpoint path>"` in Feign clients and contract files.
- For **every changed method**: find its SIBLING methods in the same
  service/repository — the ones that solve the same kind of problem — and
  record each divergence in filter, null guard, `try/catch`, pagination, or
  validation, with why the divergence is correct. **An unjustified
  divergence is a defect of this plan, not of the code.**

"No consumer" is acceptable only with the command and its empty result next
to it. A row without a command is not a verification, it is an opinion.]

## Invariants

[Conditions that hold BEFORE and AFTER the change and that **no task may
break**. One line each, with its source in parentheses (spec §, ADR,
laudo §5, or `file:line` of the current code):
- Tenant / entity / fiscal-year filters that already exist in the queries
  touched.
- Selection and status flags that already filter the result set.
- Regulatory export rules (SIM-AM, TCE, eSocial): what may and may not go
  into the file.
- Signature compatibility with data already registered in production —
  formulas, parameters, configurations that reference the old signature.
- Idempotency and commit order in accounting routines.

This is the only section of the plan the implementer receives as a **norm
over every step**: a task that satisfies its own text and breaks a line
here is wrong.]

## Review Focus

[The five input classes or failure modes the spec implies but no task's
tests exercise that are most likely to bite a person using this software
— one line each, naming the input or condition and the behavior a
reasonable person would expect, most likely first. The spec is a vision
document: it says what the software must do, not everything it will
meet, and its silence on an input is not permission for that input to
break the program. Write the list here, once, with the spec in front of
you. Then, for each line, add the test that pins it to the task that
owns the code, in that task's own step style.]

---
```

## Task Structure

````markdown
## Phase P: <Name>

**Depends on:** Phase <P-1> *(or `none` — phases with no dependency on each
other may be executed concurrently)*
**Cohesion:** [one line: why these tasks belong together]

### Task N: <Name>

**Files:**
- Create: `<path>`
- Modify: `<path>`
- Test: `<path>`

**Risk flags:** `none` *(one or more of: `security` — touches auth, credentials, input validation, permissions, crypto, or a data access boundary, and triggers pre-implementation security review before the implementer is dispatched; `concurrency` — touches shared state, a transaction, or a routine that runs in parallel; `data-migration` — changes schema, `@Entity`, `@Column`, or a native query; `regulatory` — touches a SIM-AM, TCE, or eSocial export; `backward-compat` — changes a public signature, an endpoint contract, or a format consumed by configuration already registered. Any flag other than `none` triggers the red team for the batch.)* <!-- [fork] -->

*(A task that loosens an existing filter or validation, touches a regulatory export or a payroll/tax calculation, or changes a signature that production data already references gets its flag AND an `**Open question:**` line — the question for your human partner or the controller that must be answered BEFORE it is implemented. When the demand cites legislation, the Spec or the Laudo must carry the calculation worksheet: the legal basis and one worked example. Older plans say `**Security flag:**`; read it as `**Risk flags:**` with the same value.)* <!-- [fork] -->

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

**Does NOT cover:** *(required when this task ADDS a condition, gate, trigger, or any "when X do Y" logic — state the scenarios the condition excludes — AND ALSO when this task REMOVES OR RELAXES an existing condition, filter, guard, validation, or `try/catch` — then state who is no longer protected and why that is correct. "It wasn't being used" is not a justification: show who stopped needing it. If an excluded scenario should be covered, revise this task before implementing.)* <!-- [fork] -->

- [ ] **Step 1: Write failing test**

```<lang>
<actual test code>
```

- [ ] **Step 2: Run test to verify it fails**

Run: `<command>`
Expected: FAIL with "<expected failure reason>"

- [ ] **Step 3: Implement minimal change**

```<lang>
<actual implementation code>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `<command>`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add <files>
git commit -m "<message>"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Quality Bar

- No vague steps like "update logic".
- No hidden dependencies between distant tasks.
- Call out migrations, feature flags, and rollback checks when relevant.
- Prefer small vertical slices over large horizontal layers — a phase groups slices that ship together, it is not a layer of the stack.

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Scope-reduction scan:** Search the plan for: "v1", "basic", "simple", "for now", "placeholder", "initial version", "minimal". For each hit, verify it was explicitly sanctioned by the user — not a quiet scope downgrade from what was requested. Fix any that weren't.

**5. Review Focus:** For each input class or failure mode the spec implies, is there a task whose tests exercise it? The five uncovered ones most likely to bite a person go in the Review Focus section, and each line there gets its test added to the owning task. An empty section means you checked and found none, not that you skipped the check.

**6. Blast radius and invariants:** Does every Blast Radius row have a command and a count? Does every sibling-method divergence have a written justification? Does every filter, guard, or `try/catch` some task removes appear in some `Does NOT cover`? Does every Invariants line cite its source? If any answer is no, the plan is not ready — and the task that failed is the one that will hurt most. <!-- [fork] -->

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.


## Execution Handoff

After saving the plan and completing self-review, select the execution approach
with the logic below, then output the ready message and **stop**. Do not invoke
any execution skill until the user replies.

### Selection Logic

Start from the default. It is a presumption, not a verdict: you must test it
against this plan before accepting it, and you may overrule it — with the
reason written down.

**Step 1 — the default, by size.** Count the tasks in the plan you just wrote.

| Plan | Default |
|---|---|
| ≤ 6 tasks, one phase | **Inline** (`executing-plans`) |
| 7+ tasks, or 2+ phases | **Subagent-Driven**, in ~3 cohesive batches |
| Context window ≥ 60% full | **Subagent-Driven**, whatever the size |

The cut is not arbitrary, and the reason belongs here so the next edit does not
erase it as a stray number. Measured on a 17-task plan: inline finished with
**74% of the window used and a 0.93 quality score**; three cohesive batches
finished with **26% and 0.95**, at the same wall clock and the same token cost.
What inline gives up is not the first task — it is the headroom for the fix
round that comes after the review. Correcting on a full window is where cost
and quality collapse together.

**Step 2 — criticize the default.** One sentence each, before you decide:

1. **Coupling.** Do the tasks share interfaces? Tight coupling favors inline —
   one context sees every signature. Independent tasks favor batches.
2. **Cost of a miss.** What does a defect reaching production cost here? High
   cost favors batches, which review per batch instead of only at the end.
3. **Diff size.** How much code does this touch? Five tasks that rewrite forty
   files is a large review, however short the plan looks.
4. **Context pressure.** Is this session already loaded?

**Step 3 — decide.** If the critique contradicts the default, overrule it and
say why. **Overruling with a written reason is the correct behavior, not an
exception.** Following a default you have just concluded is wrong is the error;
so is departing from it without saying why.

**Fan-out follows the phase count, not the task count.** When Subagent-Driven is
selected, it groups tasks into a few cohesive batches — starting from your
phases — and dispatches one subagent per batch. Do not let fan-out scale with
the number of tasks; that is the configuration that measured slowest,
costliest, and worst (43 min, 25M tokens, 0.81). Phases sized 4-8 tasks are
what let the executor keep it that way.

**On cost:** the controller seat is the expensive part of Subagent-Driven. In
Claude Code it can run one layer down, on a mid-tier model — see
`../using-superpowers/references/claude-code-tools.md`. Offer that when your
human partner's objection to subagents is cost.

### Ready Message

```
Plan saved to `docs/superpowers-prepared/plans/<filename>.md`. Ready to execute with **[Subagent-Driven / Inline Execution]** (<N> tasks in <P> phases) — <one sentence: the reason, naming which of the four checks decided it>. Reply to start, or say "inline" / "subagent" to switch.
```

When you overruled the default, the sentence says so: *"18 tasks would default
to subagents, but every task edits the same pipeline signature, so one context
is worth more here than per-batch review."*

**Stop here.** Do not invoke any execution skill until the user replies.

### On User Reply

**If Subagent-Driven:**
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:subagent-driven-development
- Fresh subagent per batch of tasks (formed from the plan's phases) + two-stage review

**If Inline Execution:**
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:executing-plans
- Continuous execution with checkpoints for review
