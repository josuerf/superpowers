#!/usr/bin/env bash
# Tests for verify-on-stop.js threshold resolution (getMinFilesForVerify).
# The stop-gate trigger threshold (MIN_FILES_FOR_VERIFY) must be overridable
# via .harness.config.json -> verifyOnStop.minFiles, defaulting to 3 and
# falling back to 3 on any invalid/missing/malformed input.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/verify-on-stop.js"

PASS=0
FAIL=0

# resolve <dir> -> prints the number getMinFilesForVerify returns for that dir
resolve() {
  node -e "const m=require(process.argv[1]);process.stdout.write(String(m.getMinFilesForVerify(process.argv[2])))" "$HOOK" "$1" 2>/dev/null
}

# assert <description> <expected> <actual>
assert() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1))
    echo "  ok   - $1 (got $3)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL - $1 (expected $2, got '$3')"
  fi
}

# Each case gets a fresh temp dir so .harness.config.json never leaks between cases.
mk() { mktemp -d "${TMPDIR:-/tmp}/vos-test.XXXXXX"; }
cfg() { printf '%s' "$2" > "$1/.harness.config.json"; }

echo "test-verify-on-stop: getMinFilesForVerify"

# 1. No config file -> default 3
D=$(mk); assert "no config -> default 3" "3" "$(resolve "$D")"; rm -rf "$D"

# 2. Explicit override to 1 (the workspace-harness case)
D=$(mk); cfg "$D" '{"verifyOnStop":{"minFiles":1}}'; assert "minFiles:1 -> 1" "1" "$(resolve "$D")"; rm -rf "$D"

# 3. Explicit override to 5
D=$(mk); cfg "$D" '{"verifyOnStop":{"minFiles":5}}'; assert "minFiles:5 -> 5" "5" "$(resolve "$D")"; rm -rf "$D"

# 4. Malformed JSON -> default 3
D=$(mk); cfg "$D" '{not valid json'; assert "malformed json -> 3" "3" "$(resolve "$D")"; rm -rf "$D"

# 5. Out-of-range value 0 -> default 3
D=$(mk); cfg "$D" '{"verifyOnStop":{"minFiles":0}}'; assert "minFiles:0 -> 3" "3" "$(resolve "$D")"; rm -rf "$D"

# 6. Wrong type (string) -> default 3
D=$(mk); cfg "$D" '{"verifyOnStop":{"minFiles":"2"}}'; assert "minFiles:\"2\" -> 3" "3" "$(resolve "$D")"; rm -rf "$D"

# 7. Config present but no verifyOnStop key -> default 3
D=$(mk); cfg "$D" '{"coverageMin":90}'; assert "no verifyOnStop key -> 3" "3" "$(resolve "$D")"; rm -rf "$D"

echo "test-verify-on-stop: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
