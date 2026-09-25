#!/usr/bin/env bash
# Tests for the lessons reminder in stop-reminders.js (plan M, M15): when the
# session finished a branch and the SDD ledger holds Ruling:/parked/minor
# (deferred) lines, the Stop hook reminds once to propose pattern entries.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/stop-reminders.js"

PASS=0
FAIL=0

assert() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1))
    echo "  ok   - $1 (got $3)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL - $1 (expected $2, got '$3')"
  fi
}

has() { case "$1" in *"$2"*) echo true;; *) echo false;; esac; }

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# mkws -> repo with an SDD plan workspace; path on stdout
mkws() {
  local d
  d=$(mktemp -d "${TMPDIR:-/tmp}/stoprem-test.XXXXXX")
  git -C "$d" init -q
  git -C "$d" config core.autocrlf false
  echo a > "$d/a.txt"; git -C "$d" add a.txt; git -C "$d" commit -q -m first
  mkdir -p "$d/.superpowers/sdd/my-plan"
  printf '%s' "$d"
}

ledger_with_rulings() {
  cat > "$1/.superpowers/sdd/my-plan/progress.md" <<'EOF'
# SDD ledger — plan: docs/plans/my-plan.md
Ruling: kept the legacy filter — spec silent — rework if wrong
Batch 1: parked — null check on exercicio — Ruling: guarded upstream
Batch 1: minor (deferred): rename helper
Batch 1 (Tasks 1-3): complete (commits a..b, 1 parked)
EOF
}

ledger_clean() {
  cat > "$1/.superpowers/sdd/my-plan/progress.md" <<'EOF'
# SDD ledger — plan: docs/plans/my-plan.md
Batch 1 (Tasks 1-3): complete (commits a..b, 0 parked)
EOF
}

# transcript <file> <command>: one assistant turn that ran <command> in Bash
transcript() {
  node -e "
const fs=require('fs');
fs.writeFileSync(process.argv[1], JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',name:'Bash',input:{command:process.argv[2]}}]}})+'\n');
" "$1" "$2"
}

# stop <home> <cwd> <transcript> [session] -> raw hook stdout (paths via argv so
# Git Bash converts them on Windows)
stop() {
  node -e "process.stdout.write(JSON.stringify({session_id:process.argv[3]||'s1',cwd:process.argv[1],transcript_path:process.argv[2]}))" "$2" "$3" "${4:-}" \
    | HOME="$1" USERPROFILE="$1" CLAUDE_PLUGIN_ROOT=PLUGIN node "$HOOK"
}

echo "test-stop-reminders: lessons reminder"

# 1. Ledger without rulings, session merged -> silent
H=$(mktemp -d); D=$(mkws); ledger_clean "$D"; transcript "$H/t.jsonl" "git merge --no-ff feat/x"
assert "ledger without rulings -> silent" "{}" "$(stop "$H" "$D" "$H/t.jsonl")"
rm -rf "$H" "$D"

# 2. Ledger with rulings, session did not merge -> silent
H=$(mktemp -d); D=$(mkws); ledger_with_rulings "$D"; transcript "$H/t.jsonl" "npm test"
assert "rulings but no merge -> silent" "{}" "$(stop "$H" "$D" "$H/t.jsonl")"
rm -rf "$H" "$D"

# 3. Both -> reminder, with counts and the exact record command
H=$(mktemp -d); D=$(mkws); ledger_with_rulings "$D"; transcript "$H/t.jsonl" "git merge --no-ff feat/x"
OUT=$(stop "$H" "$D" "$H/t.jsonl")
assert "rulings + merge -> reminder" "true" "$(has "$OUT" 'Lessons:')"
assert "reminder counts each kind" "true" "$(has "$OUT" '1 `Ruling:` line(s), 1 `parked` and 1 `minor (deferred)`')"
assert "reminder carries the record command" "true" \
  "$(has "$OUT" "npx tsx PLUGIN/tools/patterns/cli.ts record --from-review ")"
assert "record command names the ledger and project" "true" \
  "$(has "$OUT" "my-plan/progress.md --project $(basename "$D")")"

# 4. Second Stop in the same session -> silent (session guard)
assert "second stop same session -> silent" "{}" "$(stop "$H" "$D" "$H/t.jsonl")"
rm -rf "$H" "$D"

# 5. Ledger deleted with the plan workspace before the merge -> reminder from snapshot
H=$(mktemp -d); D=$(mkws); ledger_with_rulings "$D"; transcript "$H/t.jsonl" "npm test"
stop "$H" "$D" "$H/t.jsonl" >/dev/null                 # a Stop while the ledger exists
rm -rf "$D/.superpowers/sdd/my-plan"                    # SDD deletes the workspace
transcript "$H/t.jsonl" "gh pr create --fill"
OUT=$(stop "$H" "$D" "$H/t.jsonl" s2)
assert "deleted ledger -> reminder from snapshot" "true" "$(has "$OUT" 'superpowers-ledgers/my-plan.md')"
rm -rf "$H" "$D"

echo ""
echo "test-stop-reminders: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
