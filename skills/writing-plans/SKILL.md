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

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-prepared:subagent-driven-development (recommended) or superpowers-prepared:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-prepared:subagent-driven-development (recommended) or superpowers-prepared:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec/design doc this plan implements — the plan
argues from the spec, so the spec travels with it; executors read both]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

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

**Security flag:** `none` *(set to `security` if this task handles auth, credentials, input validation, permissions, crypto, or data access boundaries — triggers pre-implementation security review before the implementer is dispatched)*

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

**Does NOT cover:** *(required when this task adds a condition, gate, trigger, or any "when X do Y" logic — state the scenarios the condition excludes. If an excluded scenario should be covered, revise this task before implementing.)*

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

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.


## Execution Handoff

After saving the plan and completing self-review, auto-select the execution approach using the logic below, then output the ready message and **stop**. Do not invoke any execution skill until the user replies.

### Selection Logic (evaluate in order)

1. Current context window ≥ 60% full → **Subagent-Driven** (offload context pressure)
2. Task count ≥ 5 → **Subagent-Driven** (fresh context per phase)
3. Tasks have heavy inter-task state sharing (each task depends on runtime state from the previous) → **Inline**
4. Default → **Subagent-Driven**

**Fan-out follows the phase count, not the task count.** Subagent-Driven
groups tasks into a few cohesive batches — starting from your phases — and
dispatches one subagent per batch. Do not let fan-out scale with the number
of tasks; that is the configuration that measured slowest, costliest, and
worst. Phases sized 4-8 tasks are what let the executor keep it that way.

### Ready Message

```
Plan saved to `docs/superpowers-prepared/plans/<filename>.md`. Ready to execute with **[Subagent-Driven / Inline Execution]** (<N> tasks in <P> phases[, <one-word reason>]). Reply to start, or say "inline" / "subagent" to switch.
```

**Stop here.** Do not invoke any execution skill until the user replies.

### On User Reply

**If Subagent-Driven:**
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:subagent-driven-development
- Fresh subagent per batch of tasks (formed from the plan's phases) + two-stage review

**If Inline Execution:**
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:executing-plans
- Continuous execution with checkpoints for review
