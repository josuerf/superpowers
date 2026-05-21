# Spec Compliance Reviewer Prompt Template

Use this template to verify implementation matches requirements.

```
Task tool (general-purpose):
  description: "Spec review Task N"
  prompt: |
    Review Task N for spec compliance.

    ## Requirements
    <FULL task requirements>

    ## Implementation summary
    <Implementer report>

    ## Subagent rules
    You are a focused subagent. Do NOT invoke any skills from the superpowers-prepared plugin. Do NOT use the Skill tool. Your only job is the review task described below.

    ## Rules
    - Do not trust summary claims without checking code.
    - Compare requirements to implementation line by line.
    - Flag missing scope and extra scope.

    ## Output
    - Verdict: PASS | FAIL
    - Missing requirements: <list>
    - Extra behavior: <list>
    - File references: <path:line>

    ## Structured Report (REQUIRED)
    After your verdict, output a JSON report wrapped in the markers below. This is parsed by the harness — do not omit it.

    <!-- SPEC_REVIEW_REPORT -->
    ```json
    {
      "taskId": "Task N",
      "verdict": "PASS or FAIL",
      "requirements_met": ["list each requirement that was found in the code"],
      "requirements_missing": ["list each requirement that was NOT found"],
      "extra_scope": ["list any behavior added that was not in the spec"],
      "files_reviewed": ["list each file you read during review"],
      "concerns": ["list any observations or concerns"],
      "timestamp": "ISO 8601 timestamp"
    }
    ```
    <!-- /SPEC_REVIEW_REPORT -->
```
