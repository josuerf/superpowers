#!/usr/bin/env bash
# Tests for sdd-trailer.js: a `git commit` made while an SDD brief is active
# and without the SDD-Plan trailer gets a (non-blocking) reminder; every other
# case stays silent.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/sdd-trailer.js"

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

# mkrepo -> fresh repo with one commit, path on stdout
mkrepo() {
  local d
  d=$(mktemp -d "${TMPDIR:-/tmp}/sddt-test.XXXXXX")
  git -C "$d" init -q
  git -C "$d" config core.autocrlf false
  echo a > "$d/a.txt"; git -C "$d" add a.txt; git -C "$d" commit -q -m "first"
  printf '%s' "$d"
}

# commit <repo> <message>
commit() { echo "$RANDOM" >> "$1/a.txt"; git -C "$1" add a.txt; git -C "$1" commit -q -m "$2"; }

# brief <dir> [touch-date] -> writes a plan-scoped brief (optionally backdated)
brief() {
  mkdir -p "$1/.superpowers/sdd/my-plan"
  printf 'docs/plans/my-plan.md\n' > "$1/.superpowers/sdd/my-plan/plan-path"
  echo "# Batch brief" > "$1/.superpowers/sdd/my-plan/batch-1-3-brief.md"
  if [ -n "${2:-}" ]; then touch -d "$2" "$1/.superpowers/sdd/my-plan/batch-1-3-brief.md"; fi
}

# hook_out <cwd> [command] -> raw hook stdout. The cwd travels through argv so
# Git Bash converts it to a native path on Windows.
hook_out() {
  node -e "process.stdout.write(JSON.stringify({tool_name:'Bash',tool_input:{command:process.argv[2]||'git commit -m x'},cwd:process.argv[1]}))" "$1" "${2:-}" | node "$HOOK"
}

# run_hook <repo> -> "reminder" | "silent"
run_hook() { if [ "$(has "$(hook_out "$1")" 'SDD-Plan')" = true ]; then echo reminder; else echo silent; fi; }

echo "test-sdd-trailer"

# (a) no active brief -> silent
D=$(mkrepo); commit "$D" "feat: no sdd here"
assert "no brief -> silent" "silent" "$(run_hook "$D")"; rm -rf "$D"

# (b) active brief and trailer present -> silent
D=$(mkrepo); brief "$D"
commit "$D" "feat: with trailer

SDD-Plan: docs/plans/my-plan.md
SDD-Batch: 1-3"
assert "active brief + trailer -> silent" "silent" "$(run_hook "$D")"; rm -rf "$D"

# (c) active brief and trailer missing -> reminder
D=$(mkrepo); brief "$D"; commit "$D" "feat: forgot the trailer"
assert "active brief + no trailer -> reminder" "reminder" "$(run_hook "$D")"
OUT=$(hook_out "$D")
assert "reminder names the brief" "true" "$(has "$OUT" '.superpowers/sdd/my-plan/batch-1-3-brief.md')"
assert "reminder names the plan from plan-path" "true" "$(has "$OUT" 'SDD-Plan: docs/plans/my-plan.md')"
rm -rf "$D"

# (d) brief older than the last commit (and stale) -> silent
D=$(mkrepo); brief "$D" "3 days ago"; commit "$D" "feat: brief is old"
assert "old brief -> silent" "silent" "$(run_hook "$D")"; rm -rf "$D"

# extra: a non-commit Bash command never reminds
D=$(mkrepo); brief "$D"; commit "$D" "feat: x"
assert "non-commit command -> {}" "{}" "$(hook_out "$D" "git status")"; rm -rf "$D"

# extra: a brief whose batch already reported and predates the previous commit
# is finished work -> silent
D=$(mkrepo); brief "$D" "1 hour ago"
echo "# report" > "$D/.superpowers/sdd/my-plan/batch-1-3-report.md"
commit "$D" "feat: after the batch"; commit "$D" "feat: unrelated follow-up"
assert "reported old brief -> silent" "silent" "$(run_hook "$D")"; rm -rf "$D"

# extra: workspace SDD dir found from a nested product repo (projects/<repo>)
WS=$(mktemp -d "${TMPDIR:-/tmp}/sddt-ws.XXXXXX")
brief "$WS"
mkdir -p "$WS/projects"; P=$(mkrepo); mv "$P" "$WS/projects/app"
commit "$WS/projects/app" "feat: product commit"
assert "workspace brief + nested repo commit -> reminder" "true" \
  "$(has "$(hook_out "$WS" "git -C projects/app commit -m x")" 'SDD-Plan')"
rm -rf "$WS"

# isGitCommitCommand: `git commit` as the subcommand, global options allowed before it
iscommit() { node -e "process.stdout.write(String(require(process.argv[1]).isGitCommitCommand(process.argv[2])))" "$HOOK" "$1"; }
assert "git commit -m x -> commit" "true" "$(iscommit 'git commit -m x')"
assert "git -c k=v commit -> commit" "true" "$(iscommit 'git -c user.name=t -c user.email=t@t commit -qm x')"
assert "git -C dir commit -> commit" "true" "$(iscommit 'git -C projects/app commit -m x')"
assert "cd dir && git commit -> commit" "true" "$(iscommit 'cd projects/app && git commit --amend --no-edit')"
assert "git log --grep commit -> not a commit" "false" "$(iscommit 'git log --grep commit')"
assert "git commit-tree -> not a commit" "false" "$(iscommit 'git commit-tree abc123 -m x')"
assert "git show HEAD -- commit -> not a commit" "false" "$(iscommit 'git show HEAD -- commit')"
assert "git commit --dry-run -> not a commit" "false" "$(iscommit 'git commit --dry-run')"

# resolveCommitDir: a Git Bash drive path (/c/Users/...) is a Windows drive path
# MSYS_NO_PATHCONV keeps Git Bash from rewriting the /c/... argument itself, so
# the hook path is converted by hand.
commitdir() { MSYS_NO_PATHCONV=1 node -e "process.stdout.write(require(process.argv[1]).resolveCommitDir(process.argv[2], process.argv[3]))" "$(cygpath -w "$HOOK" 2>/dev/null || echo "$HOOK")" "$1" "$2"; }
if [ "$(node -p process.platform)" = "win32" ]; then
  assert "cd /c/Users/x && git commit -> C: drive" 'C:\Users\x' "$(commitdir 'cd /c/Users/x && git commit -m y' 'D:\ws')"
  assert "git -C /d/repo commit -> D: drive" 'D:\repo' "$(commitdir 'git -C /d/repo commit -m y' 'C:\ws')"
fi

echo ""
echo "test-sdd-trailer: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
