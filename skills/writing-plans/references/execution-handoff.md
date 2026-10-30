# Execution Handoff

Part of superpowers-prepared:writing-plans. The plan is saved and self-reviewed.
Select the execution approach with the logic below, output the ready message,
and **stop**.

## Selection Logic

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
`../../using-superpowers/references/claude-code-tools.md`. Offer that when your
human partner's objection to subagents is cost.

## Ready Message

```
Plan saved to `docs/superpowers-prepared/plans/<filename>.md`. Ready to execute with **[Subagent-Driven / Inline Execution]** (<N> tasks in <P> phases) — <one sentence: the reason, naming which of the four checks decided it>. Reply to start, or say "inline" / "subagent" to switch.
```

When you overruled the default, the sentence says so: *"18 tasks would default
to subagents, but every task edits the same pipeline signature, so one context
is worth more here than per-batch review."*

**Stop here.** Do not invoke any execution skill until the user replies.

## On User Reply

**If Subagent-Driven:**
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:subagent-driven-development
- Fresh subagent per batch of tasks (formed from the plan's phases) + two-stage review

**If Inline Execution:**
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:executing-plans
- Continuous execution with checkpoints for review
