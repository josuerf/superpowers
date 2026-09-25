# Java 8 / Spring Boot 2.x — Evaluation Rules

This file exists because `java-springboot.md` assumes Java 21 and Jakarta EE 10,
and applying it to the legacy codebase produces false positives en masse — which
teaches the team to ignore the reviewer. A reviewer nobody believes is worse than
no reviewer at all. These rules REPLACE the Java 21 idioms for this stack.

## What is NOT a finding in this stack

- `javax.persistence`, `javax.validation`, `javax.servlet` — these are the CORRECT
  namespace in Spring Boot 2.x. Never report the absence of `jakarta.*`.
- A POJO with getters/setters instead of a `record` — `record` does not exist in Java 8.
- `RestTemplate` instead of `RestClient` — `RestClient` does not exist in Spring Boot 2.x.
- Absence of `sealed`, of pattern matching in `switch`, of virtual threads,
  or of `var` in a context Java 8 does not accept.
- `Optional` missing from an old signature: suggesting it is noise, not a finding.

## What IS a finding, and weighs more than in a modern stack

- **A filter, guard or `try/catch` removed with no justification in the diff.** In
  legacy code the reason a filter exists usually lives only in the code; removing it
  without a written justification is the signature of this fleet's most expensive defect.
- **Divergence between the changed method and sibling methods of the same repository/service**
  in entity filter, tenant filter, selection flag, exception handling or pagination.
  Cite both: the changed method and the sibling.
- **Native `@Query`** whose declared parameters are not all used, or whose aliases
  do not match the projection of the return interface.
- **String concatenation in a query** — Java 8 has no text blocks, and manual
  concatenation is the real injection vector in this codebase.
- **`SimpleDateFormat` in an instance or static field** — it is not thread-safe, and
  this codebase has services that share it.
- **A new or changed JPA entity without a matching migration in the same MR.**
- **A report source changed without its `.jrxml`/`.jasper` pair regenerated.**
