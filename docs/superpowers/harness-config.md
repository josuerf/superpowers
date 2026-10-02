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
      "java8-spring": 10,
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
    "minFiles": 3,
    "mode": "block"
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Kill switch. `false` turns the whole hook off: no carrasco gate, no verify-all and no gate-log line. Only a literal `false` disables it; any other value (or a malformed config) keeps the gate on. |
| `minFiles` | `number` | `3` | Minimum number of session-edited changed source files required to trigger the gate. Set to `1` to gate every edit; raise it to make the gate fire less often. |
| `mode` | `"block"` \| `"warn"` | `"block"` | `"block"` returns `decision: "block"` when a check fails. `"warn"` lets the session end and appends what the gate *would* have done to `.superpowers/gate-log.jsonl` (see below). Any other value falls back to `"block"`. |
| `baseRef` | `string` | — | Comparison ref, e.g. `"origin/main"`. When set, the changed-file set is `merge-base(baseRef, HEAD)..HEAD` plus the working tree, per repository — see below. |
| `projectRoots` | `string[]` | inferred | Which projects the gate verifies, as paths relative to the project root. Entries may use `*` / `?` wildcards per path segment (`"projects/*"`). Only needed when inference is not enough — see below. Declaring it also makes the gate fail closed on an undetectable stack. |

#### `mode: "warn"` and the gate log

Turning a gate on in the dark is how a team learns to route around it. In
`warn` mode the hook never blocks: it returns `{}` and appends one JSON line
per would-be block to `.superpowers/gate-log.jsonl` at the session root, so
you can count how often the gate would fire before promoting it to `block`:

```json
{"ts":"2026-09-30T14:02:11Z","cwd":"/home/x/workspace","repo":"projects/api-contabil","wouldBlock":true,"reason":"verify-all failed","files":7,"stack":null}
```

| Field | Meaning |
|---|---|
| `ts` | UTC timestamp of the stop |
| `cwd` | Session root the hook ran in |
| `repo` | Project that would have blocked, relative to `cwd` (`.` for the carrasco gate, which runs at the session root) |
| `wouldBlock` | Always `true` today — the line exists because the gate would have blocked |
| `reason` | `verify-all failed`, `carrasco <gate>: <reason>`, or `undetected stack in a declared project root` |
| `files` | Changed source files counted for that project |
| `stack` | Stack of the project when the hook knows it, else `null` |

Every gate that would fire is logged: in `warn` mode a stale or missing
carrasco review is recorded and `verify-all` still runs. The file is local
measurement data; add `.superpowers/` to `.gitignore` if you do not want it
versioned.

#### `baseRef`: gating the branch, not just the working tree

Without `baseRef`, the gate only sees uncommitted changes — committing a change
hid it from the gate. With `baseRef` set, each project root counts the files
changed since `merge-base(baseRef, HEAD)` plus the working tree, computed in
the repository that owns that root (every nested repository resolves its own
merge-base). A ref that does not resolve in a repository (a fresh clone with no
`origin/main`, a repository with no commits) degrades to the working tree for
that repository instead of failing. The files still have to be ones this
session edited, so a long-lived branch does not re-gate old work on every stop.

`baseRef` also feeds the carrasco review: the hook passes `--base <baseRef>`
to `review gate-status`, and the CLI uses `verifyOnStop.baseRef` as the default
`--base` for `review plan`, `review aggregate` and `review gate-status`. The
review fingerprint then covers the diff from the merge-base to the working tree
(plus untracked files) and ignores staging flags, so committing an
already-reviewed change set no longer makes the review look stale.

#### Where the gate runs (workspace harnesses)

The gate verifies the project a session actually touched, not necessarily the
directory the session started in. For a single-repo project the two are the
same and nothing changes. For a **workspace harness** — a root that holds the
real repositories under `projects/<repo>` — they are not, and verifying the
workspace root measures nothing: no test suite lives at that level, so the
harness reports `Coverage 0.0%` in a tenth of a second and blocks every
session. (Stack detection does not fail there either: its `node-std` fallback
finds stray `.js` under `scripts/`, so the "could not detect stack" escape
hatch never opens.)

A directory counts as a workspace harness when it **declares
`projectRoots`**, or when it has **no stack manifest of its own and a
`projects/` directory**. Everywhere else — including a monorepo with a
`package.json` at the root and another in `packages/a`, or a plain repo with
no manifest at all — the gate runs verify-all at the project root exactly as it
always did: no sub-root inference, no skipping.

Resolution order (workspace harness only):

1. **`projectRoots`**, when declared. Entries are relative to the project root
   and may use `*` / `?` per segment (`"projects/*"` expands to every
   non-hidden directory under `projects/`); an entry that is not an existing
   directory inside it is ignored.
2. **Inferred** from the files this session edited: each file resolves to its
   nearest ancestor holding a stack manifest (`package.json`, `pyproject.toml`,
   `go.mod`, `pom.xml`, `Cargo.toml`, a `.csproj`, ...) or a
   `.harness.config.json`, bounded by the project root.
3. **The project root itself**, when nothing else resolves.

Each resolved project is read through its own git repository, so a repository
the workspace ignores (its own `.git`, or an ignored `projects/` entry) is
still gated. Every touched project is verified in turn, sharing one 3-minute
budget, and a root with no stack manifest — a workspace or orchestration
directory — is skipped rather than reported as 0% covered.

```json
{
  "verifyOnStop": {
    "minFiles": 1,
    "mode": "warn",
    "baseRef": "origin/main",
    "projectRoots": ["projects/*"]
  }
}
```

#### Fail-closed when `projectRoots` is declared

Without a declaration, a project whose stack the harness cannot detect is
skipped (fail open) — the harness cannot evaluate an environment it does not
know. A declared root is different: someone stated that a project lives there,
so "no stack found" is a configuration defect. For declared roots the hook
looks for a stack manifest up to 3 levels below the root (e.g.
`projects/api/backend/pom.xml`), verifies the manifest directory that owns the
changed files, and when there is none it blocks (`mode: "block"`) with a
message pointing at `projectRoots` and `lib/harness/discovery.ts`, or logs the
occurrence (`mode: "warn"`).

#### Infrastructure files are in scope

Configuration and documentation files (`.md`, `.json`, `.yaml`, lock files,
`Dockerfile`, ...) never trigger the gate, with one exception: YAML/JSON/SQL
under infrastructure and migration directories (`helm/`, `charts/`, `k8s/`,
`kubernetes/`, `deploy/`, `manifests/`, `migrations/`, `db/migration/`,
`flyway/`, `liquibase/`) and YAML/properties under `src/main/resources/` are
counted as source — a wrong Helm chart takes a service down as surely as a
code bug.

This applies to every project, with or without a `.harness.config.json`: an
edited `application.yml`, a chart template or a migration now **counts toward
`minFiles`** and can trigger the gate (and the carrasco review) on its own. A
session that only touches such files used to end without verification; raise
`minFiles` if that is too eager for your project.

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
| `chunking.maxChunks` | `number` | none (no cap) | Hard ceiling on chunks/subagents a plan can produce; smallest chunks are merged pairwise until it fits |
| `carrasco.redTeamEnabled` | `boolean` | `true` | Enables the aggressive "carrasco" reviewer persona |
| `carrasco.redTeamParallel` | `boolean` | `true` | Dispatches all chunk reviewers in parallel instead of sequentially |
| `carrasco.requireReproducibleTrigger` | `boolean` | `true` | Requires findings to name a concrete reproducing input/state, not a theoretical concern |
| `carrasco.focusCategories` | `string[]` | see above | Categories the reviewers are instructed to prioritize |
| `carrasco.severityThreshold` | `string` | `"High"` | Minimum finding severity that causes a `BLOCK` verdict |
| `standards.autoDetect` | `boolean` | `true` | Reads `CLAUDE.md`/`AGENTS.md` and neighboring code to infer project standards |
| `standards.paths` | `string[]` | `[]` | Additional authoritative standards/architecture docs to enforce |
| `reportOutput.saveToHarness` | `boolean` | `true` | Saves the aggregated report under `.harness/reviews/` |
| `reportOutput.format` | `string` | `"both"` | `"markdown"` \| `"json"` \| `"both"` |

**Automatic (Stop-hook) runs:** when the gate above triggers the review automatically
rather than a human explicitly asking for it, and this project hasn't set any
`chunking` key, the `carrasco-review` skill runs the plan with cheaper inline defaults
(`maxChunks: 2`, `maxFilesPerChunk: 20`, `byTopic: true`) instead of the table above,
and asks your human partner for a config before proceeding when the change set exceeds
40 files. Once you set any `chunking` key here, your values are used for automatic
runs too — see the skill's "Automatic Trigger (Stop-hook Gate)" section.

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
    "minFiles": 3,
    "mode": "block"
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
