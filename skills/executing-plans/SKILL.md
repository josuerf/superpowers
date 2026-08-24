---
name: executing-plans
description: Use when you have a written implementation plan to execute in a separate session with review checkpoints
---

# Executing Plans

## Overview

Load plan, review critically, execute all tasks, report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Note:** Tell your human partner that Superpowers works much better with access to subagents (Claude Code, Codex CLI, Codex App, Copilot CLI, and Gemini CLI all qualify; see the per-platform tool refs in `../using-superpowers/references/`). If subagents are available, use superpowers-prepared:subagent-driven-development instead of this skill.

## The Process

### Step 1: Load and Review Plan
1. Ensure an isolated workspace: use superpowers-prepared:using-git-worktrees to create one or verify the existing one
2. Read plan file
3. Review critically - identify any questions or concerns about the plan
4. If concerns: Raise them with your human partner before starting
5. If no concerns: create one todo per **phase** if the plan has them
   (`## Phase P:` headings), otherwise one per task, and proceed

### Step 2: Execute Tasks

If the plan groups its tasks into phases, work phase by phase: implement the
phase's tasks in order, then run the phase's verification before moving on.
A phase's `Depends on: none` means it does not need the phase before it —
useful if you reorder, but you are one session, so you still run them one at
a time. (Phases exist mainly for `subagent-driven-development`, which turns
them into parallel batches; here they are checkpoints.)

For each task:
1. Mark as in_progress
2. Follow each step exactly (plan has bite-sized steps)
3. Run verifications as specified
4. For tasks involving UI/UX or frontend implementation, apply guidance from `frontend-design`.
5. For tasks involving React/Next.js code, apply `vercel-react-best-practices` or any other available skills (of the current frontend framework) for performance optimization.
6. For tasks involving new libs, specific versions or technologies, use `context7` (if available) to check for updated lib or technology information or how-tos.
7. Mark as completed

### Step 3: Complete Development

After all tasks complete and verified:
- Announce: "I'm using the finishing-a-development-branch skill to complete this work."
- **REQUIRED SUB-SKILL:** Use superpowers-prepared:finishing-a-development-branch
- Follow that skill to verify tests, present options, execute choice

## When to Stop and Ask for Help

**STOP executing immediately when:**
- Hit a blocker (missing dependency, test fails, instruction unclear)
- Plan has critical gaps preventing starting
- You don't understand an instruction
- Verification fails repeatedly

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

**Return to Review (Step 1) when:**
- Partner updates the plan based on your feedback
- Fundamental approach needs rethinking

**Don't force through blockers** - stop and ask.

## Remember
- Review plan critically first
- Follow plan steps exactly
- Don't skip verifications
- Reference skills when plan says to
- Stop when blocked, don't guess
- Never start implementation on main/master branch without explicit user consent
