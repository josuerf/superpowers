#!/usr/bin/env bash
# Tests for inject-harness-context.js (plan M, M18): opt-in PreToolUse hook on
# Task|Agent that points a dispatch at existing harness files by path.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/inject-harness-context.js"

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

# mkws -> workspace with known-issues.md and an ownership map
mkws() {
  local d
  d=$(mktemp -d "${TMPDIR:-/tmp}/ihc-test.XXXXXX")
  mkdir -p "$d/architecture" "$d/projects/app"
  echo "# Known issues" > "$d/known-issues.md"
  echo "# Ownership" > "$d/architecture/ownership-map.md"
  printf '%s' "$d"
}
cfg() { printf '%s' "$2" > "$1/.harness.config.json"; }

# run <cwd> [tool] [prompt] -> raw hook stdout (cwd via argv for Git Bash)
run() {
  node -e "process.stdout.write(JSON.stringify({tool_name:process.argv[2]||'Agent',tool_input:{prompt:process.argv[3]||'implement task 1'},cwd:process.argv[1]}))" "$1" "${2:-}" "${3:-}" \
    | node "$HOOK"
}

echo "test-inject-harness-context"

# 1. No config -> off
D=$(mkws); assert "no config -> {}" "{}" "$(run "$D")"; rm -rf "$D"

# 2. Config without the flag -> off (default false)
D=$(mkws); cfg "$D" '{"coverageMin":80}'; assert "flag absent -> {}" "{}" "$(run "$D")"; rm -rf "$D"

# 3. enabled:true -> paths of the existing files, never their contents
D=$(mkws); cfg "$D" '{"injectHarnessContext":{"enabled":true}}'
OUT=$(run "$D")
assert "enabled -> names known-issues.md" "true" "$(has "$OUT" 'known-issues.md')"
assert "enabled -> names ownership-map.md" "true" "$(has "$OUT" 'architecture/ownership-map.md')"
assert "missing file is not named" "false" "$(has "$OUT" 'integration-map.md')"
assert "contents are not pasted" "false" "$(has "$OUT" '# Ownership')"
assert "no permission decision" "false" "$(has "$OUT" 'permissionDecision')"
# The official hooks reference does not document updatedInput being applied
# without a permissionDecision, and parallel hooks have no documented merge
# rule for it; a hook must never approve a permission. So the block stays in
# additionalContext — which reaches the CONTROLLER alongside the tool result —
# and says so honestly instead of pretending to reach the subagent.
assert "delivered as additionalContext, not updatedInput" "true" "$(printf '%s' "$OUT" | node -e "
let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const o=JSON.parse(s).hookSpecificOutput||{};
process.stdout.write(String(typeof o.additionalContext==='string' && !('updatedInput' in o)));});")"
assert "text is addressed to the controller" "true" "$(has "$OUT" 'for the controller to include in the dispatch')"
assert "text does not claim to reach the subagent" "false" "$(has "$OUT" 'you should consult before changing code')"
rm -rf "$D"

# 4. Config found from a nested cwd (projects/app)
D=$(mkws); cfg "$D" '{"injectHarnessContext":{"enabled":true}}'
assert "nested cwd finds workspace config" "true" "$(has "$(run "$D/projects/app")" 'known-issues.md')"
rm -rf "$D"

# 5. Paths already in the prompt are not repeated; all present -> {}
D=$(mkws); cfg "$D" '{"injectHarnessContext":{"enabled":true}}'
assert "prompt already names everything -> {}" "{}" \
  "$(run "$D" Agent 'read known-issues.md and architecture/ownership-map.md first')"
rm -rf "$D"

# 6. Custom paths, and a path escaping the workspace is ignored
D=$(mkws); echo x > "$D/architecture/event-map.md"
cfg "$D" '{"injectHarnessContext":{"enabled":true,"paths":["architecture/event-map.md","../outside.md"]}}'
OUT=$(run "$D")
assert "custom path named" "true" "$(has "$OUT" 'event-map.md')"
assert "default list replaced" "false" "$(has "$OUT" 'known-issues.md')"
assert "escaping path ignored" "false" "$(has "$OUT" 'outside.md')"
rm -rf "$D"

# 7. Other tools are ignored; malformed config stays off
D=$(mkws); cfg "$D" '{"injectHarnessContext":{"enabled":true}}'
assert "non-dispatch tool -> {}" "{}" "$(run "$D" Bash)"
cfg "$D" '{broken'
assert "malformed config -> {}" "{}" "$(run "$D")"
rm -rf "$D"

echo ""
echo "test-inject-harness-context: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
