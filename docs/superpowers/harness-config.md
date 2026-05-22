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

## Full Example

```json
{
  "coverageMin": 85,
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
