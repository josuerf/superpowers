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

echo ""
echo "test-verify-on-stop: isUndetectedStackFailure / buildBlockReason"

# 8. "Could not detect stack" on stderr -> treated as an undetected-stack failure (fail open)
assert "undetected-stack stderr -> true" "true" "$(node -e "
const m = require(process.argv[1]);
process.stdout.write(String(m.isUndetectedStackFailure({ stderr: 'Error: Could not detect stack for project at /x' })));
" "$HOOK")"

# 9. A real lint/test failure is NOT mistaken for an undetected-stack failure
assert "real failure stderr -> false" "false" "$(node -e "
const m = require(process.argv[1]);
process.stdout.write(String(m.isUndetectedStackFailure({ stderr: 'ESLint found 3 errors' })));
" "$HOOK")"

# 10. buildBlockReason must surface stderr (where thrown errors land), not just a thin stdout banner
assert "block reason includes stderr detail" "true" "$(node -e "
const m = require(process.argv[1]);
const reason = m.buildBlockReason({ stdout: 'Running verify-all...', stderr: 'Error: something specific broke' }, 3);
process.stdout.write(String(reason.includes('something specific broke')));
" "$HOOK")"


echo ""
echo "test-verify-on-stop: project-root resolution (workspace harness)"

# A workspace harness: the session cwd is the workspace root and the real
# repositories live under projects/. Both layouts seen in the wild are covered:
# `app` is tracked by the workspace git, `lib` is ignored there and carries its
# own .git, so the workspace's `git status` cannot see inside it at all.
gitinit() {
  git -C "$1" init -q >/dev/null 2>&1
  git -C "$1" add -A >/dev/null 2>&1
  git -C "$1" -c user.email=t@t -c user.name=t commit -qm init >/dev/null 2>&1
}

WS=$(mk)
mkdir -p "$WS/scripts" "$WS/projects/app/src" "$WS/projects/lib/src"
cfg "$WS" '{"verifyOnStop":{"minFiles":3}}'
printf '{"name":"app"}'       > "$WS/projects/app/package.json"
printf '{"name":"lib"}'       > "$WS/projects/lib/package.json"
printf 'console.log(1)\n'     > "$WS/scripts/tool.js"
printf 'export const a = 1\n' > "$WS/projects/app/src/a.ts"
printf 'export const b = 1\n' > "$WS/projects/lib/src/b.ts"
printf 'projects/lib/\n'      > "$WS/.gitignore"
gitinit "$WS/projects/lib"
gitinit "$WS"
# Dirty every tree, so each root has uncommitted source changes of its own.
printf 'export const a = 2\n' >> "$WS/projects/app/src/a.ts"
printf 'export const b = 2\n' >> "$WS/projects/lib/src/b.ts"
printf 'console.log(2)\n'     >> "$WS/scripts/tool.js"

# hookcall <fn> <json-args> -> the function's result as JSON.
# {WS} in the arguments stands for the workspace directory: shells that rewrite
# POSIX paths when calling a native binary (Git Bash / MSYS) only do so for
# whole arguments, never inside a JSON blob, so the placeholder is substituted
# here from the already-rewritten path instead. Paths in the result come back
# relative to the workspace with forward slashes, so assertions read the same
# on Windows and POSIX.
hookcall() {
  node -e "
const path = require('path');
const m = require(process.argv[1]);
const ws = require('fs').realpathSync.native(process.argv[4]);
const args = JSON.parse(process.argv[3].split('{WS}').join(JSON.stringify(ws).slice(1, -1)));
const out = m[process.argv[2]](...args);
const rel = (p) => path.relative(ws, p).split(path.sep).join('/') || '.';
const norm = (v) => Array.isArray(v) ? v.map(norm) : (typeof v === 'string' ? rel(v) : v);
process.stdout.write(JSON.stringify(norm(out)));
" "$HOOK" "$1" "$2" "$WS" 2>/dev/null
}

# has <haystack> <needle>
has() { case "$1" in *"$2"*) echo true;; *) echo false;; esac }

# 11. A file edited inside a nested repository resolves to that repository
assert "nested file -> project root" '"projects/app"' \
  "$(hookcall findProjectRoot '["{WS}/projects/app/src/a.ts", "{WS}"]')"

# 12. A file at the workspace root resolves to the workspace itself
assert "workspace file -> cwd" '"."' \
  "$(hookcall findProjectRoot '["{WS}/scripts/tool.js", "{WS}"]')"

# 13. A workspace root with only .harness.config.json is not a verifiable project
assert "workspace root has no stack manifest" "false" \
  "$(hookcall hasStackManifest '["{WS}"]')"

# 14. A project with a manifest is verifiable
assert "project root has stack manifest" "true" \
  "$(hookcall hasStackManifest '["{WS}/projects/app"]')"

# 15. Touching two projects resolves to both roots, not to the workspace
assert "two touched projects -> two roots" '["projects/app","projects/lib"]' \
  "$(hookcall resolveVerifyRoots '["{WS}", ["{WS}/projects/app/src/a.ts", "{WS}/projects/lib/src/b.ts"]]')"

# 16. Nothing touched -> falls back to cwd (single-repo behavior is unchanged)
assert "no touched files -> cwd" '["."]' \
  "$(hookcall resolveVerifyRoots '["{WS}", []]')"

# 17. A repository the workspace git ignores is still read, from its own git
assert "own-git project sees its changes" "true" \
  "$(has "$(hookcall getUncommittedSourceFiles '["{WS}/projects/lib"]')" "projects/lib/src/b.ts")"

# 18. ... and those files are NOT attributed to the workspace root
assert "workspace does not claim ignored project files" "false" \
  "$(has "$(hookcall getUncommittedSourceFiles '["{WS}"]')" "projects/lib/src/b.ts")"

# 19. A tracked nested project is scoped to itself, not to the whole workspace
assert "tracked project scoped to itself" "true" \
  "$(has "$(hookcall getUncommittedSourceFiles '["{WS}/projects/app"]')" "projects/app/src/a.ts")"
assert "tracked project excludes sibling files" "false" \
  "$(has "$(hookcall getUncommittedSourceFiles '["{WS}/projects/app"]')" "scripts/tool.js")"

# 20. An explicit declaration wins over inference
cfg "$WS" '{"verifyOnStop":{"minFiles":3,"projectRoots":["projects/app"]}}'
assert "declared root wins over inference" '["projects/app"]' \
  "$(hookcall resolveVerifyRoots '["{WS}", ["{WS}/projects/lib/src/b.ts"]]')"

# 21. Garbage declarations (missing dir, escaping path, wrong type) fall back
cfg "$WS" '{"verifyOnStop":{"projectRoots":["projects/ghost","../outside",7]}}'
assert "invalid declarations -> inference" '["projects/lib"]' \
  "$(hookcall resolveVerifyRoots '["{WS}", ["{WS}/projects/lib/src/b.ts"]]')"

rm -rf "$WS" 2>/dev/null

echo ""
echo "test-verify-on-stop: block reason names the failing project"

# 22. Every failing project is named and gets a reproducible --root command
REASON=$(node -e "
const m = require(process.argv[1]);
process.stdout.write(m.buildBlockReason(
  [
    { root: '/ws/projects/app', result: { stdout: '', stderr: 'coverage too low' } },
    { root: '/ws/projects/lib', result: { stdout: '', stderr: 'lint failed' } },
  ],
  4,
  '/ws',
));
" "$HOOK" 2>/dev/null)
assert "block reason passes --root" "true" "$(has "$REASON" "--root")"
assert "block reason names both projects" "true" \
  "$([ "$(has "$REASON" 'projects/app')" = true ] && [ "$(has "$REASON" 'projects/lib')" = true ] && echo true || echo false)"
assert "block reason keeps each failure output" "true" \
  "$([ "$(has "$REASON" 'coverage too low')" = true ] && [ "$(has "$REASON" 'lint failed')" = true ] && echo true || echo false)"

echo ""
echo "test-verify-on-stop: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
