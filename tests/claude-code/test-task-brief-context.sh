#!/usr/bin/env bash
# Tests for scripts/task-brief-context: the context envelope task-brief
# prepends to every brief — the plan's normative sections (Global
# Constraints, Invariants), its Blast Radius, and the contract readback —
# with an explicit warning when a required section is missing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SDD_SCRIPTS="$REPO_ROOT/skills/subagent-driven-development/scripts"

FAILURES=0
TEST_ROOT=""

pass() { echo "  [PASS] $1"; }
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

cleanup() {
    if [[ -n "$TEST_ROOT" && -d "$TEST_ROOT" ]]; then
        rm -rf "$TEST_ROOT"
    fi
}

# write_plan FILE [with-invariants|without-invariants|fenced-invariants]
write_plan() {
    local file=$1 variant=$2
    {
        cat <<'HEAD'
# Remove stale selection filter Implementation Plan

**Goal:** Stop exporting non-winning bids.
**Architecture:** One repository query and its export writer.
**Tech Stack:** Java 8, Spring Boot 2

**Spec:** docs/specs/2026-09-01-export.md

**Laudo:** incidents/ADM-2845-laudo.md

## Global Constraints

- Java 8 language level only
- CONSTRAINT-MARKER: exports keep the fixed-width layout

## Blast Radius

| What changes | Who consumes it today | How it was verified (command) | Result | What happens to the consumer |
|---|---|---|---|---|
| `BidRepository.findExportable` | `SimAmExporter` | `grep -rn "findExportable" projects/` | 2 | reads the new filter |

HEAD
        case "$variant" in
            with-invariants)
                cat <<'INV'
## Invariants

- INVARIANT-MARKER: only winning bids enter the SIM-AM file (laudo §5)
- Tenant filter on entity id stays (BidRepository.java:41)

INV
                ;;
            fenced-invariants)
                # Under a section the envelope does not extract, so the only
                # way FENCED-MARKER reaches the envelope is by the fenced
                # heading being mistaken for a real one.
                cat <<'INV'
## Notes

Example of the section, for the reader:

```markdown
## Invariants

- FENCED-MARKER: this line is inside a code block
```

INV
                ;;
        esac
        cat <<'TAIL'
## Review Focus

- A bid with a null selection flag

## Phase 1: Export

**Depends on:** none
**Cohesion:** one query and its only writer

### Task 1: Tighten the query

TASK-ONE-BODY

### Task 2: Adjust the writer

TASK-TWO-BODY

### Task 3: Regression test

TASK-THREE-BODY

### Task 4: Null flag

TASK-FOUR-BODY

### Task 5: Docs

TASK-FIVE-BODY

### Task 6: Cleanup

TASK-SIX-BODY
TAIL
    } > "$file"
}

main() {
    echo "=== Test: task-brief-context ==="

    TEST_ROOT="$(mktemp -d)"
    trap cleanup EXIT

    git init -q -b main "$TEST_ROOT/repo"
    local repo
    repo="$(cd "$(cd "$TEST_ROOT/repo" && git rev-parse --show-toplevel)" && pwd)"

    write_plan "$repo/full.md" with-invariants
    write_plan "$repo/noinv.md" without-invariants
    write_plan "$repo/fenced.md" fenced-invariants

    # --- argument validation ---
    local rc=0
    bash "$SDD_SCRIPTS/task-brief-context" >/dev/null 2>&1 || rc=$?
    if [[ "$rc" -eq 2 ]]; then
        pass "task-brief-context without a plan errors with exit 2"
    else
        fail "task-brief-context without a plan errors with exit 2 (got $rc)"
    fi

    # --- 1. complete plan: normative sections carried verbatim, plus readback ---
    local env
    env="$(cd "$repo" && bash "$SDD_SCRIPTS/task-brief-context" full.md)"
    if [[ "$env" == *"## Global constraints (NORMATIVE)"* \
        && "$env" == *"CONSTRAINT-MARKER: exports keep the fixed-width layout"* ]]; then
        pass "complete plan: Global Constraints carried under the NORMATIVE heading"
    else
        fail "complete plan: Global Constraints carried under the NORMATIVE heading"
    fi
    if [[ "$env" == *"## Invariants you must NOT break (NORMATIVE)"* \
        && "$env" == *"INVARIANT-MARKER: only winning bids enter the SIM-AM file"* \
        && "$env" == *"BidRepository.java:41"* ]]; then
        pass "complete plan: every Invariants line carried"
    else
        fail "complete plan: every Invariants line carried"
    fi
    if [[ "$env" == *'`grep -rn "findExportable" projects/`'* ]]; then
        pass "complete plan: Blast Radius table carried with its command"
    else
        fail "complete plan: Blast Radius table carried with its command"
    fi
    if [[ "$env" == *"**Laudo:** incidents/ADM-2845-laudo.md"* \
        && "$env" == *"**Spec:** docs/specs/2026-09-01-export.md"* ]]; then
        pass "complete plan: Spec and Laudo paths carried"
    else
        fail "complete plan: Spec and Laudo paths carried"
    fi
    if [[ "$env" == *"## Before writing any code: confirm the contract"* \
        && "$env" == *"**What I do NOT know:**"* \
        && "$env" == *"**Reversal check.**"* ]]; then
        pass "complete plan: readback and end-of-task checks present"
    else
        fail "complete plan: readback and end-of-task checks present"
    fi
    if [[ "$env" != *"MISSING FROM THE PLAN"* ]]; then
        pass "complete plan: no missing-section warning"
    else
        fail "complete plan: no missing-section warning"
    fi

    # --- 2. plan without Invariants: explicit warning, not an empty heading ---
    env="$(cd "$repo" && bash "$SDD_SCRIPTS/task-brief-context" noinv.md)"
    local inv_block
    inv_block="$(printf '%s\n' "$env" | awk '/^## Invariants you must NOT break/ {p=1; next} p && /^## / {exit} p')"
    if [[ "$inv_block" == *"**MISSING FROM THE PLAN.**"* ]]; then
        pass "plan without Invariants: the envelope says MISSING FROM THE PLAN"
    else
        fail "plan without Invariants: the envelope says MISSING FROM THE PLAN"
        echo "    block: $inv_block"
    fi

    # --- 3. a section inside a code fence is not a section ---
    env="$(cd "$repo" && bash "$SDD_SCRIPTS/task-brief-context" fenced.md)"
    inv_block="$(printf '%s\n' "$env" | awk '/^## Invariants you must NOT break/ {p=1; next} p && /^## / {exit} p')"
    if [[ "$inv_block" == *"**MISSING FROM THE PLAN.**"* && "$env" != *"FENCED-MARKER"* ]]; then
        pass "fenced '## Invariants' heading is not captured"
    else
        fail "fenced '## Invariants' heading is not captured"
        echo "    block: $inv_block"
    fi

    # --- 4. task-brief PLAN 1-6: envelope AND the six tasks, envelope first ---
    local out="$TEST_ROOT/batch.md"
    (cd "$repo" && bash "$SDD_SCRIPTS/task-brief" full.md 1-6 "$out" >/dev/null)
    local env_line task_line all_tasks=1 marker
    env_line="$(grep -n '^# Context envelope' "$out" | head -1 | cut -d: -f1)"
    task_line="$(grep -n '^### Task 1:' "$out" | head -1 | cut -d: -f1)"
    for marker in TASK-ONE-BODY TASK-TWO-BODY TASK-THREE-BODY TASK-FOUR-BODY TASK-FIVE-BODY TASK-SIX-BODY; do
        grep -q "$marker" "$out" || all_tasks=0
    done
    if [[ -n "$env_line" && -n "$task_line" && "$env_line" -lt "$task_line" && "$all_tasks" -eq 1 ]]; then
        pass "task-brief 1-6: envelope precedes all six tasks"
    else
        fail "task-brief 1-6: envelope precedes all six tasks"
        echo "    envelope line: $env_line, task 1 line: $task_line, all tasks: $all_tasks"
    fi

    # --- 5. idempotent: two runs write the same file ---
    local out2="$TEST_ROOT/batch-again.md"
    (cd "$repo" && bash "$SDD_SCRIPTS/task-brief" full.md 1-6 "$out2" >/dev/null)
    if cmp -s "$out" "$out2"; then
        pass "two runs produce identical briefs"
    else
        fail "two runs produce identical briefs"
    fi

    # --- task-brief without the fork script still works (upstream behavior) ---
    local bare="$TEST_ROOT/bare"
    mkdir -p "$bare"
    cp "$SDD_SCRIPTS/task-brief" "$SDD_SCRIPTS/sdd-workspace" "$bare/"
    local bare_out="$TEST_ROOT/bare.md" bare_rc=0
    (cd "$repo" && bash "$bare/task-brief" full.md 1 "$bare_out" >/dev/null 2>&1) || bare_rc=$?
    if [[ "$bare_rc" -eq 0 ]] && grep -q TASK-ONE-BODY "$bare_out" && ! grep -q 'Context envelope' "$bare_out"; then
        pass "task-brief without task-brief-context next to it degrades to the plain brief"
    else
        fail "task-brief without task-brief-context next to it degrades to the plain brief (rc $bare_rc)"
    fi

    # --- a failing task-brief-context does not abort the brief ---
    local broken="$TEST_ROOT/broken"
    mkdir -p "$broken"
    cp "$SDD_SCRIPTS/task-brief" "$SDD_SCRIPTS/sdd-workspace" "$broken/"
    printf '#!/usr/bin/env bash\necho "# Context envelope PARTIAL"\nexit 1\n' > "$broken/task-brief-context"
    local broken_out="$TEST_ROOT/broken.md" broken_err="$TEST_ROOT/broken.err" broken_rc=0
    (cd "$repo" && bash "$broken/task-brief" full.md 1-2 "$broken_out" >/dev/null 2>"$broken_err") || broken_rc=$?
    if [[ "$broken_rc" -eq 0 ]] && grep -q TASK-ONE-BODY "$broken_out" && grep -q TASK-TWO-BODY "$broken_out"; then
        pass "failing task-brief-context: brief still carries every task"
    else
        fail "failing task-brief-context: brief still carries every task (rc $broken_rc)"
    fi
    if grep -qi 'task-brief-context failed' "$broken_err" && ! grep -q 'PARTIAL' "$broken_out"; then
        pass "failing task-brief-context: warning on stderr, no partial envelope in the brief"
    else
        fail "failing task-brief-context: warning on stderr, no partial envelope in the brief"
    fi

    echo ""
    if [[ "$FAILURES" -ne 0 ]]; then
        echo "FAILED: $FAILURES assertion(s)."
        exit 1
    fi
    echo "PASS"
}

main "$@"
