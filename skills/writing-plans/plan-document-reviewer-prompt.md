# Plan Document Reviewer Prompt Template

Use this template when dispatching a plan document reviewer subagent after the plan is saved.

**Purpose:** Verify the plan is complete, matches the spec, and has proper task decomposition and phase grouping.

**Dispatch after:** The complete plan is written to `docs/superpowers-prepared/plans/`

```
Subagent (general-purpose):
  description: "Review plan document"
  prompt: |
    You are a plan document reviewer. Verify this plan is complete and ready for implementation.

    You are a focused subagent. Do NOT invoke superpowers-prepared process
    skills (workflow-control skills such as brainstorming, writing-plans,
    subagent-driven-development, or any code-review pipeline) and never
    dispatch a subagent of your own — you must not re-enter the workflow
    that dispatched you. Skills defined by this project or workspace
    are allowed, as are `frontend-design` and
    `vercel-react-best-practices`. Your only job is the review task described below.

    **Plan to review:** [PLAN_FILE_PATH]
    **Spec for reference:** [SPEC_FILE_PATH]

    ## What to Check

    | Category | What to Look For |
    |----------|------------------|
    | Completeness | TODOs, placeholders, incomplete tasks, missing steps |
    | Spec Alignment | Plan covers spec requirements, no major scope creep |
    | Task Decomposition | Tasks have clear boundaries, steps are actionable |
    | Phase Grouping | Tasks grouped into phases, each with `Depends on` and cohesion; every task in exactly one phase; ~3 phases of 4-8 tasks. Flag ungrouped plans and many-tiny-phase plans. |
    | Buildability | Could an engineer follow this plan without getting stuck? |

    Phase grouping matters more than it looks: the executor forms its
    subagent batches from these phases, and over-splitting them is the
    largest cost and quality regression in plan execution.

    ## Calibration

    **Only flag issues that would cause real problems during implementation.**
    An implementer building the wrong thing or getting stuck is an issue.
    Minor wording, stylistic preferences, and "nice to have" suggestions are not.

    Approve unless there are serious gaps — missing requirements from the spec,
    contradictory steps, placeholder content, or tasks so vague they can't be acted on.

    ## Output Format

    ## Plan Review

    **Status:** Approved | Issues Found

    **Issues (if any):**
    - [Phase P] or [Task X, Step Y]: [specific issue] - [why it matters for implementation]

    **Recommendations (advisory, do not block approval):**
    - [suggestions for improvement]
```

**Reviewer returns:** Status, Issues (if any), Recommendations
