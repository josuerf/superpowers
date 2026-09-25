#!/usr/bin/env bash
# Tests for skill-activator.js keyword recall over the partitioned known-issues:
# known-issues.md (HOT, injected at session start) plus the per-domain lessons
# in known-issues-by-domain/*.md, which are recalled by keyword only and are
# budgeted in bytes (8 KB per file) — an over-budget file is searched only up
# to the budget, with a warning in the injected context.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/skill-activator.js"
CODEX="$REPO/hooks/codex/user-prompt-submit-adapter.js"

PASS=0
FAIL=0

# run <dir> <prompt> -> prints the additionalContext the hook would inject ("" if none)
run() {
  local payload
  payload=$(node -e 'process.stdout.write(JSON.stringify({prompt:process.argv[1],cwd:process.argv[2]}))' "$2" "$1")
  printf '%s' "$payload" | node "$HOOK" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(!s){process.stdout.write("");return}const o=JSON.parse(s);process.stdout.write((o.hookSpecificOutput&&o.hookSpecificOutput.additionalContext)||"")})'
}

# assert_contains <description> <needle> <haystack>
assert_contains() {
  if printf '%s' "$3" | grep -qF -- "$2"; then
    PASS=$((PASS + 1)); echo "  ok   - $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL - $1 (missing '$2')"
  fi
}
assert_not_contains() {
  if printf '%s' "$3" | grep -qF -- "$2"; then
    FAIL=$((FAIL + 1)); echo "  FAIL - $1 (unexpected '$2')"
  else
    PASS=$((PASS + 1)); echo "  ok   - $1"
  fi
}

mk() { mktemp -d "${TMPDIR:-/tmp}/ska-test.XXXXXX"; }

echo "test-skill-activator: known-issues-by-domain recall"

# 1. A lesson in a domain file is recalled by keyword, labeled with its file.
D=$(mk); mkdir -p "$D/known-issues-by-domain"
cat > "$D/known-issues-by-domain/billing.md" <<'EOF'
# Billing lessons

- Invoice rounding: the ledger rounds half-even; never round in the controller.
- Refund webhook retries: make refund idempotent by providerRefundId.
EOF
OUT=$(run "$D" "why is the refund webhook applied twice on retries")
assert_contains "domain lesson recalled" "providerRefundId" "$OUT"
assert_contains "labeled with its domain file" "(billing.md)" "$OUT"
assert_contains "wrapped in the domain recall block" "<known-issues-domain-recall>" "$OUT"
assert_not_contains "non-matching lesson not injected" "half-even" "$OUT"
rm -rf "$D"

# 2. HOT file and domain files are both searched.
D=$(mk); mkdir -p "$D/known-issues-by-domain"
printf '## Tenant filter\nEvery repository query must filter by tenantUuid.\n' > "$D/known-issues.md"
printf '### Tenant export\nThe export job must also filter by tenantUuid.\n' > "$D/known-issues-by-domain/export.md"
OUT=$(run "$D" "add a repository query without the tenantUuid filter")
assert_contains "HOT entry still recalled" "<known-issues-recall>" "$OUT"
assert_contains "domain entry recalled alongside HOT" "The export job must also filter" "$OUT"
rm -rf "$D"

# 3. Fixed (struck-through) domain entries are skipped.
D=$(mk); mkdir -p "$D/known-issues-by-domain"
printf -- '- ~~Cache stampede on warmup~~ fixed in 2.3\n' > "$D/known-issues-by-domain/cache.md"
OUT=$(run "$D" "cache stampede during warmup")
assert_not_contains "fixed entry skipped" "stampede" "$OUT"
rm -rf "$D"

# 4. A domain file over 8 KB is searched only up to 8 KB, with a warning.
D=$(mk); mkdir -p "$D/known-issues-by-domain"
{
  echo "- Payroll cutoff: the monthly payroll cutoff runs in America/Sao_Paulo time."
  for i in $(seq 1 200); do echo "- filler lesson number $i about unrelated matters padding padding"; done
  echo "- Pension ceiling: participants without ceiling stop contributing silently."
} > "$D/known-issues-by-domain/payroll.md"
OUT=$(run "$D" "payroll cutoff pension ceiling timezone")
assert_contains "entry within the budget recalled" "America/Sao_Paulo" "$OUT"
assert_not_contains "entry past the byte budget not loaded" "stop contributing silently" "$OUT"
assert_contains "over-budget warning shown" "payroll.md — curate it" "$OUT"
rm -rf "$D"

# 5. No domain directory -> no domain block, nothing breaks.
D=$(mk)
OUT=$(run "$D" "refund webhook retries idempotent")
assert_not_contains "no domain block without the directory" "known-issues-domain-recall" "$OUT"
rm -rf "$D"

# 6. The Codex adapter shares the same recall.
D=$(mk); mkdir -p "$D/known-issues-by-domain"
printf -- '- Refund webhook retries: idempotent by providerRefundId.\n' > "$D/known-issues-by-domain/billing.md"
OUT=$(node -e 'const {evaluatePayload}=require(process.argv[1]);const o=evaluatePayload({prompt:"refund webhook retries applied twice",cwd:process.argv[2]});process.stdout.write((o.hookSpecificOutput||{}).additionalContext||"")' "$CODEX" "$D")
assert_contains "codex adapter recalls domain lessons" "providerRefundId" "$OUT"
rm -rf "$D"

# 7. session-start keeps injecting only known-issues.md: domain lessons are recall-only.
D=$(mk); mkdir -p "$D/known-issues-by-domain"
printf '## Structural pitfall\nNever call the legacy SOAP endpoint synchronously.\n' > "$D/known-issues.md"
printf -- '- Domain lesson: invoices close at midnight UTC.\n' > "$D/known-issues-by-domain/billing.md"
OUT=$(cd "$D" && CLAUDE_PLUGIN_ROOT="$REPO" bash "$REPO/hooks/session-start" 2>/dev/null)
assert_contains "session-start injects the HOT file" "legacy SOAP endpoint" "$OUT"
assert_not_contains "session-start does not inject domain lessons" "invoices close at midnight" "$OUT"
rm -rf "$D"

echo ""
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
