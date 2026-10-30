# Subagent Skill Leakage Prevention

Part of superpowers-prepared:subagent-driven-development. Read it before you
change the focused-subagent instruction in the prompt templates or
`hooks/subagent-guard.js`.

The failure this prevents is narrow: an implementer finds the workflow
skills on disk, invokes one, and re-enters the pipeline that dispatched it —
re-planning, re-brainstorming, spawning its own reviewers. That is *process*
leakage.

Keeping a subagent ignorant is not a goal. One that needs your project's
conventions, or how to write a performant React component, should load that
knowledge; forced to guess, it produces work the reviewer rejects, costing a
full fix round. Blocking domain knowledge buys nothing and pays twice.

The boundary is by *kind of skill*, not by origin:

| Kind | Examples | Subagent may invoke? |
|---|---|---|
| superpowers-prepared **process** skills | `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `requesting-code-review`, `carrasco-review`, `systematic-debugging`, `test-driven-development` | **No** — these re-enter the workflow |
| superpowers-prepared **implementation-support** skills | `frontend-design`, `vercel-react-best-practices` | **Yes**, when the task's work calls for them |
| **Project / workspace** skills | anything the user's repo or workspace defines | **Yes** — outside this plugin's authority |

Every subagent prompt MUST include this instruction:

> You are a focused subagent. Do NOT invoke superpowers-prepared **process**
> skills (`brainstorming`, `writing-plans`, `executing-plans`,
> `subagent-driven-development`, the code-review pipelines, or any other
> workflow-control skill) — you must not re-enter the workflow that
> dispatched you, and you never dispatch subagents of your own. You MAY
> invoke skills defined by this project or workspace, and you MAY invoke
> `frontend-design` and `vercel-react-best-practices` when the work calls
> for them. Your job is the task described below, nothing more.

This is enforced at runtime by `hooks/subagent-guard.js`, whose
`PROCESS_SKILLS` list is the single source of truth for what is blocked.
Keep the wording above and that list in agreement — the prompt teaches the
rule, the hook enforces it, and a subagent that only ever meets the hook
learns the rule from its block message.

**Name the skills you want used.** You have the plan, the spec, and the
codebase context; the subagent has a brief. When a task's work has an
obvious match — a UI task and `frontend-design`, a React task and
`vercel-react-best-practices`, a task touching a project convention and the
project's own skill for it — say so in the dispatch brief's
**Suggested skills** line. A named suggestion costs you one line and saves
the subagent the discovery it would otherwise do badly or skip entirely.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "The implementer spawned its own reviewer — free extra assurance" | It's a duplicate seat reviewing the same diff; the batch review is the gate. A worker-spawned reviewer is a defect to flag, not rigor. |
| "The subagent shouldn't use skills, it might go off-script" | Only *process* skills go off-script. Project skills and `frontend-design` / `vercel-react-best-practices` are domain knowledge; name the ones it should use. |
