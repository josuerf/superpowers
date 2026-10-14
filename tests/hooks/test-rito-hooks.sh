#!/usr/bin/env bash
# [fork] card C123 (C-35): with SUPERPOWERS_PREPARED_RITO=1 the SessionStart
# hooks write nothing in the session's directory: session-start does not
# generate .harness.config.json, and context-engine.js writes neither
# context-snapshot.json nor .gitignore. Without the variable, both behave as
# before.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0
assert() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "  ok   - $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL - $1 (expected $2, got '$3')"
  fi
}
exists() { [ -e "$1" ] && echo yes || echo no; }

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# A product repository with two commits, so context-engine has a diff to snapshot.
mkrepo() {
  local d
  d=$(mktemp -d "${TMPDIR:-/tmp}/rito-hooks.XXXXXX")
  git -C "$d" init -q; git -C "$d" config core.autocrlf false
  echo "a" > "$d/a.txt"; git -C "$d" add .; git -C "$d" commit -q -m first
  echo "b" > "$d/a.txt"; git -C "$d" commit -qam second
  printf '%s' "$d"
}

# run_hooks <dir> <rito: 0|1>: both SessionStart hooks, as Claude Code runs them, with a throwaway HOME.
run_hooks() {
  local h; h=$(mktemp -d)
  local env_rito=()
  [ "$2" = 1 ] && env_rito=(SUPERPOWERS_PREPARED_RITO=1)
  (cd "$1" && env "${env_rito[@]}" HOME="$h" USERPROFILE="$h" CLAUDE_PLUGIN_ROOT="$REPO" \
    bash "$REPO/hooks/session-start" >/dev/null 2>&1 </dev/null)
  node -e "process.stdout.write(JSON.stringify({cwd:process.argv[1]}))" "$1" \
    | env "${env_rito[@]}" HOME="$h" USERPROFILE="$h" node "$REPO/hooks/context-engine.js" >/dev/null 2>&1
  rm -rf "$h"
}

echo "test-rito-hooks"

D=$(mkrepo)
run_hooks "$D" 0
assert "without the variable: .harness.config.json is generated" yes "$(exists "$D/.harness.config.json")"
assert "without the variable: context-snapshot.json is written" yes "$(exists "$D/context-snapshot.json")"
assert "without the variable: .gitignore gains the snapshot" yes "$(grep -qx 'context-snapshot.json' "$D/.gitignore" 2>/dev/null && echo yes || echo no)"
rm -rf "$D"

D=$(mkrepo)
run_hooks "$D" 1
assert "rito: no .harness.config.json" no "$(exists "$D/.harness.config.json")"
assert "rito: no context-snapshot.json" no "$(exists "$D/context-snapshot.json")"
assert "rito: no .gitignore" no "$(exists "$D/.gitignore")"
assert "rito: the tree stays clean" "" "$(git -C "$D" status --porcelain --untracked-files=all)"
rm -rf "$D"

D=$(mkrepo); printf 'node_modules\n' > "$D/.gitignore"; git -C "$D" add .gitignore; git -C "$D" commit -qm gi
run_hooks "$D" 1
assert "rito: an existing .gitignore is not touched" "" "$(git -C "$D" status --porcelain --untracked-files=all)"
rm -rf "$D"

# Stop and PostToolUse hooks: in rito mode they neither order the session around
# (carrasco gate, commit reminder) nor touch the product's .gitignore.
# stop_hook <dir> <rito: 0|1> <hook file>: the hook's stdout for a Stop payload.
stop_hook() {
  local h; h=$(mktemp -d)
  # The session's edit log, as track-edits.js leaves it: six files written.
  mkdir -p "$h/.claude/hooks-logs"
  for i in 1 2 3 4 5 6; do echo "$(date -u +%Y-%m-%dT%H:%M:%S.000Z) | t | Write | $1/f$i.js" >> "$h/.claude/hooks-logs/edit-log.txt"; done
  local env_rito=()
  [ "$2" = 1 ] && env_rito=(SUPERPOWERS_PREPARED_RITO=1)
  node -e "process.stdout.write(JSON.stringify({cwd:process.argv[1],session_id:'t',hook_event_name:'Stop'}))" "$1"     | (cd "$1" && env "${env_rito[@]}" HOME="$h" USERPROFILE="$h" node "$REPO/hooks/$3" 2>/dev/null)
  rm -rf "$h"
}
D=$(mkrepo)
for i in 1 2 3 4 5 6; do echo "x" > "$D/f$i.js"; done
assert "without the variable: stop-reminders asks for a commit" yes "$(stop_hook "$D" 0 stop-reminders.js | grep -q 'Commit reminder' && echo yes || echo no)"
assert "rito: stop-reminders says nothing" "{}" "$(stop_hook "$D" 1 stop-reminders.js)"
echo '{"reviewAggressiveness":{"enabled":true}}' > "$D/.harness.config.json"
assert "without the variable: verify-on-stop blocks (gate on, 6 files changed)" yes "$(stop_hook "$D" 0 verify-on-stop.js | grep -q '"decision":"block"' && echo yes || echo no)"
assert "rito: verify-on-stop says nothing (gate on, 6 files changed)" "{}" "$(stop_hook "$D" 1 verify-on-stop.js)"
rm -rf "$D"

# track_edit <dir> <rito: 0|1>: a Write of state.md, as PostToolUse sends it.
track_edit() {
  local h; h=$(mktemp -d)
  local env_rito=()
  [ "$2" = 1 ] && env_rito=(SUPERPOWERS_PREPARED_RITO=1)
  node -e "process.stdout.write(JSON.stringify({cwd:process.argv[1],session_id:'t',tool_name:'Write',tool_input:{file_path:require('path').join(process.argv[1],'state.md')}}))" "$1"     | (cd "$1" && env "${env_rito[@]}" HOME="$h" USERPROFILE="$h" node "$REPO/hooks/track-edits.js" >/dev/null 2>&1)
  rm -rf "$h"
}
D=$(mkrepo); echo "estado" > "$D/state.md"
track_edit "$D" 0
assert "without the variable: track-edits adds state.md to .gitignore" yes "$(grep -qx 'state.md' "$D/.gitignore" 2>/dev/null && echo yes || echo no)"
rm -rf "$D"
D=$(mkrepo); echo "estado" > "$D/state.md"
track_edit "$D" 1
assert "rito: track-edits leaves .gitignore alone" no "$(exists "$D/.gitignore")"
rm -rf "$D"

echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
