# .harness.config.json

Configuration file for the Superpowers Harness. Placed at the project root, it is automatically read by the harness to customize quality, security, duplication, complexity, and patterns checks.

## Behavior

If the file does not exist, **all defaults are used**. If it exists, it is merged with defaults — you only need to specify what you want to override.

```json
{
  "coverageMin": 90,
  "securityScan": { "enabled": true }
}
```

## Root Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `coverageMin` | `number` | `80` | Minimum test coverage percentage |
| `securityScan` | `object` | — | Security scan configuration |
| `domainSpecific` | `object` | `{}` | Domain-specific checks (frontend, backend, infra) |
| `timeout` | `object` | — | Timeouts in seconds |
| `failOn` | `object` | — | Defines when each step blocks the pipeline |
| `duplication` | `object` | — | Code duplication validator configuration |
| `complexity` | `object` | — | Cyclomatic complexity validator configuration |
| `patterns` | `object` | — | Patterns system configuration (recurring error learning) |
| `verifyOnStop` | `object` | — | Controls the Stop-hook quality gate (runs once, when a session tries to end) |
| `reviewAggressiveness` | `object` | — | Carrasco code-review gate configuration (disabled by default — see below) |

---

### securityScan

```json
{
  "securityScan": {
    "enabled": true,
    "tools": {
      "semgrep": true,
      "gitleaks": true,
      "npmAudit": true,
      "trivy": false
    }
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enables/disables security scanning |
| `tools` | `object` | — | Tool name → boolean map. `false` disables the tool |

---

### timeout

```json
{
  "timeout": {
    "verifyLocal": 30,
    "verifyAll": 300
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `verifyLocal` | `number` | `30` | Timeout in seconds for `verify-local` |
| `verifyAll` | `number` | `300` | Timeout in seconds for `verify-all` |

---

### failOn

```json
{
  "failOn": {
    "lint": "error",
    "coverage": "warning",
    "security": "error"
  }
}
```

| Property | Type | Default | Possible Values | Description |
|---|---|---|---|---|
| `lint` | `string` | `"error"` | `"error"` / `"warning"` | Minimum severity at which lint blocks the pipeline |
| `coverage` | `string` | `"warning"` | `"error"` / `"warning"` | Minimum severity at which coverage blocks the pipeline |
| `security` | `string` | `"error"` | `"error"` / `"warning"` / `"human_review"` | Minimum severity at which security blocks. `human_review` fails the pipeline requiring manual review |

---

### duplication

```json
{
  "duplication": {
    "enabled": true,
    "maxDuplication": 5,
    "minLines": 5,
    "minTokens": 50,
    "ignorePatterns": [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/node_modules/**",
      "**/*.min.js"
    ]
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enables/disables the validator |
| `maxDuplication` | `number` | `5` | Maximum allowed duplication percentage |
| `minLines` | `number` | `5` | Minimum lines to consider a block as duplicate |
| `minTokens` | `number` | `50` | Minimum tokens to consider a block as duplicate |
| `ignorePatterns` | `string[]` | — | Glob patterns for files to ignore |

---

### complexity

```json
{
  "complexity": {
    "enabled": true,
    "thresholds": {
      "react-nextjs": 10,
      "node-express": 10,
      "node-fastify": 10,
      "node-elysia": 10,
      "java-springboot": 10,
      "csharp-dotnet": 15,
      "csharp-aspnet": 15,
      "python-fastapi": 10,
      "go-std": 10
    }
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enables/disables the validator |
| `thresholds` | `object` | — | Stack → maximum allowed cyclomatic complexity (McCabe). Unlisted stacks use the validator's default threshold |

---

### patterns

Recurring error learning system. Nested under `patterns` in `.harness.config.json`.

```json
{
  "patterns": {
    "enabled": true,
    "globalWiki": true,
    "globalPath": "~/.superpowers/patterns-wiki",
    "bootstrapThreshold": 10,
    "recurrenceThreshold": {
      "minFrequency": 3,
      "minProjects": 2
    },
    "staleness": {
      "reviewDays": 30,
      "archiveDays": 90
    }
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enables/disables the patterns system |
| `globalWiki` | `boolean` | `true` | If `true`, uses a global wiki shared across projects. If `false`, uses only the project-local wiki |
| `globalPath` | `string` | `"~/.superpowers/patterns-wiki"` | Path to the global wiki. Supports `~` for home directory. Can be overridden with the `SUPERPOWERS_PATTERNS_WIKI` env var |
| `bootstrapThreshold` | `number` | `10` | Occurrence count for a pattern to graduate from bootstrap to promoted |
| `recurrenceThreshold` | `object` | — | Criteria for detecting a pattern as recurring |
| `recurrenceThreshold.minFrequency` | `number` | `3` | Minimum occurrence frequency |
| `recurrenceThreshold.minProjects` | `number` | `2` | Minimum number of distinct projects |
| `staleness.reviewDays` | `number` | `30` | Days without activity to flag a pattern for review |
| `staleness.archiveDays` | `number` | `90` | Days without activity to archive a pattern |

---

### verifyOnStop

Controls the `Stop` hook (`hooks/verify-on-stop.js`) — the gate that runs when a
session tries to end. It runs **once**, against everything changed in the
session, instead of on every individual edit.

```json
{
  "verifyOnStop": {
    "minFiles": 3
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `minFiles` | `number` | `3` | Minimum number of session-edited source files with uncommitted changes required to trigger the gate. Set to `1` to gate every edit; raise it to make the gate fire less often. |

---

### reviewAggressiveness

Configuration for the **carrasco code-review gate** — an aggressive,
standards-enforcing review (`superpowers-prepared:carrasco-review`) that can
be wired into the `Stop` hook so it runs automatically before a session is
allowed to end.

**Disabled by default** (`enabled: false`). With it disabled, the `Stop`
hook still runs `verify-all` once at the end of a development session (lint,
tests, coverage, security, duplication, complexity — see `timeout` and
`failOn` above) but does **not** force a full carrasco review. The block
below is included here so you know every knob available if you decide to
turn it on — either globally via this file, or ad hoc by invoking the
`carrasco-review` skill directly (which ignores `enabled` and always runs).

```json
{
  "reviewAggressiveness": {
    "enabled": false,
    "level": "standard",
    "chunking": {
      "enabled": true,
      "maxFilesPerChunk": 10,
      "maxLinesPerChunk": 2000,
      "byTopic": true
    },
    "carrasco": {
      "redTeamEnabled": true,
      "redTeamParallel": true,
      "requireReproducibleTrigger": true,
      "focusCategories": [
        "logic-bugs",
        "adversarial-inputs",
        "state-corruption",
        "concurrency-timing",
        "resource-exhaustion",
        "error-cascading",
        "assumption-violations",
        "production-context-assumptions"
      ],
      "severityThreshold": "High"
    },
    "standards": {
      "autoDetect": true,
      "paths": []
    },
    "reportOutput": {
      "saveToHarness": true,
      "format": "both"
    }
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Master switch for the automated Stop-hook gate. Does not affect manually invoking the `carrasco-review` skill. |
| `level` | `string` | `"standard"` | `"standard"` (calibrated everyday severity) \| `"strict"` \| `"carrasco"` (uncompromising — every finding at or above the threshold blocks) |
| `chunking.enabled` | `boolean` | `true` | Splits large change sets into chunks reviewed by separate subagents |
| `chunking.maxFilesPerChunk` | `number` | `10` | Max files per review chunk before splitting |
| `chunking.maxLinesPerChunk` | `number` | `2000` | Max changed lines per review chunk before splitting |
| `chunking.byTopic` | `boolean` | `true` | Groups files by topic/module instead of splitting arbitrarily |
| `carrasco.redTeamEnabled` | `boolean` | `true` | Enables the aggressive "carrasco" reviewer persona |
| `carrasco.redTeamParallel` | `boolean` | `true` | Dispatches all chunk reviewers in parallel instead of sequentially |
| `carrasco.requireReproducibleTrigger` | `boolean` | `true` | Requires findings to name a concrete reproducing input/state, not a theoretical concern |
| `carrasco.focusCategories` | `string[]` | see above | Categories the reviewers are instructed to prioritize |
| `carrasco.severityThreshold` | `string` | `"High"` | Minimum finding severity that causes a `BLOCK` verdict |
| `standards.autoDetect` | `boolean` | `true` | Reads `CLAUDE.md`/`AGENTS.md` and neighboring code to infer project standards |
| `standards.paths` | `string[]` | `[]` | Additional authoritative standards/architecture docs to enforce |
| `reportOutput.saveToHarness` | `boolean` | `true` | Saves the aggregated report under `.harness/reviews/` |
| `reportOutput.format` | `string` | `"both"` | `"markdown"` \| `"json"` \| `"both"` |

**Why this defaults off:** the gate is tied to an exact diff fingerprint —
any edit after a passing review invalidates it, forcing a full re-review
before the session can stop. Combined with per-task reviews that skills like
`subagent-driven-development` already run, this made the *carrasco* level in
particular a significant source of end-to-end latency. Turn it on
deliberately, and prefer `"standard"` or `"strict"` over `"carrasco"` unless
you specifically want every session gated by the most exhaustive pass.

---

## Full Example

```json
{
  "coverageMin": 85,
  "verifyOnStop": {
    "minFiles": 3
  },
  "reviewAggressiveness": {
    "enabled": false,
    "level": "standard",
    "chunking": {
      "enabled": true,
      "maxFilesPerChunk": 10,
      "maxLinesPerChunk": 2000,
      "byTopic": true
    },
    "carrasco": {
      "redTeamEnabled": true,
      "redTeamParallel": true,
      "requireReproducibleTrigger": true,
      "focusCategories": [
        "logic-bugs",
        "adversarial-inputs",
        "state-corruption",
        "concurrency-timing",
        "resource-exhaustion",
        "error-cascading",
        "assumption-violations",
        "production-context-assumptions"
      ],
      "severityThreshold": "High"
    },
    "standards": {
      "autoDetect": true,
      "paths": []
    },
    "reportOutput": {
      "saveToHarness": true,
      "format": "both"
    }
  },
  "securityScan": {
    "enabled": true,
    "tools": {
      "semgrep": true,
      "gitleaks": true,
      "npmAudit": true,
      "trivy": true
    }
  },
  "domainSpecific": {
    "frontend": {
      "enabled": true,
      "budget": {
        "bundleSize": 250
      }
    }
  },
  "timeout": {
    "verifyLocal": 60,
    "verifyAll": 600
  },
  "failOn": {
    "lint": "error",
    "coverage": "error",
    "security": "human_review"
  },
  "duplication": {
    "enabled": true,
    "maxDuplication": 3,
    "minLines": 10,
    "minTokens": 100,
    "ignorePatterns": [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/node_modules/**",
      "**/*.min.js",
      "**/generated/**"
    ]
  },
  "complexity": {
    "enabled": true,
    "thresholds": {
      "react-nextjs": 8,
      "node-express": 8,
      "python-fastapi": 7
    }
  },
  "patterns": {
    "enabled": true,
    "globalWiki": true,
    "bootstrapThreshold": 5,
    "recurrenceThreshold": {
      "minFrequency": 2,
      "minProjects": 1
    },
    "staleness": {
      "reviewDays": 60,
      "archiveDays": 180
    }
  }
}
```

## Absence Behavior

| Situation | Behavior |
|---|---|
| File does not exist | All defaults are used |
| File exists but is invalid JSON | Defaults are used (silently) |
| Property not specified | That property's default is kept |
| Only `patterns` specified | Only patterns is overridden; everything else uses defaults |
