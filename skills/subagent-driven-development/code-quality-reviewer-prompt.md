# Code Quality Reviewer Prompt Template

Dispatch only after spec compliance passes.

Include in the reviewer prompt: "You are a focused subagent. Do NOT invoke any skills from the superpowers-prepared plugin. Do NOT use the Skill tool. Your only job is the review task described below."

```
Task tool (superpowers-prepared:code-reviewer):
  Use template at requesting-code-review/code-reviewer.md

  WHAT_WAS_IMPLEMENTED: <implementer summary>
  PLAN_OR_REQUIREMENTS: Task N from <plan-file>
  BASE_SHA: <pre-task sha>
  HEAD_SHA: <post-task sha>
  DESCRIPTION: <task summary>
```

**Spec Review Findings (injected by Main Agent):**

The spec reviewer has already verified compliance with requirements. Their findings are provided below:

<!-- SPEC_REVIEW_FINDINGS -->
<spec-review-report-json>
<!-- /SPEC_REVIEW_FINDINGS -->

The spec reviewer verified: <requirements_met>
The spec reviewer noted concerns: <concerns>

**Your focus:** The spec reviewer already checked scope compliance. Focus on: code quality, architecture, error handling, edge cases not covered by the spec review, test quality, and any gaps the spec reviewer did not address. Do not repeat scope verifications already done.

**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files? (Don't flag pre-existing file sizes — focus on what this change contributed.)

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment
