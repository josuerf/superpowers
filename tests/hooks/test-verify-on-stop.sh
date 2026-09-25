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
echo "test-verify-on-stop: gate mode (block | warn) and gate log (M1)"

# gatemode <dir> -> what getGateMode returns for that dir
gatemode() {
  node -e "const m=require(process.argv[1]);process.stdout.write(m.getGateMode(process.argv[2]))" "$HOOK" "$1" 2>/dev/null
}

# 23. No config -> block
D=$(mk); assert "no config -> block" "block" "$(gatemode "$D")"; rm -rf "$D"
# 24. mode:"warn" -> warn
D=$(mk); cfg "$D" '{"verifyOnStop":{"mode":"warn"}}'; assert "mode:warn -> warn" "warn" "$(gatemode "$D")"; rm -rf "$D"
# 25. mode:"lixo" -> block (conservative fallback)
D=$(mk); cfg "$D" '{"verifyOnStop":{"mode":"lixo"}}'; assert "mode:lixo -> block" "block" "$(gatemode "$D")"; rm -rf "$D"
# 26. malformed config -> block
D=$(mk); cfg "$D" '{nope'; assert "malformed config -> block" "block" "$(gatemode "$D")"; rm -rf "$D"

# 27. appendGateLog writes one JSON line with the documented fields
D=$(mk)
node -e "
const m = require(process.argv[1]);
m.appendGateLog(process.argv[2], { repo: 'projects/api', reason: 'verify-all failed', files: 7, stack: 'java-springboot' });
m.appendGateLog(process.argv[2], { repo: '.', reason: 'carrasco absent', files: 2 });
" "$HOOK" "$D" 2>/dev/null
LOG="$D/.superpowers/gate-log.jsonl"
assert "gate log has two lines" "2" "$(wc -l < "$LOG" 2>/dev/null | tr -d ' ')"
assert "gate log line has the documented shape" "true" "$(node -e "
const l = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8').split('\n')[0]);
const keys = Object.keys(l).join(',');
process.stdout.write(String(keys === 'ts,cwd,repo,wouldBlock,reason,files,stack' && l.wouldBlock === true && l.files === 7 && l.repo === 'projects/api' && /Z$/.test(l.ts)));
" "$LOG" 2>/dev/null)"
rm -rf "$D"

# 28. Block messages no longer advertise the commit/push bypass
assert "verify block reason has no bypass hint" "false" "$(has "$(node -e "
const m = require(process.argv[1]);
process.stdout.write(m.buildBlockReason({ stdout: '', stderr: 'x' }, 3));
" "$HOOK" 2>/dev/null)" "bypass")"
assert "carrasco block reason has no bypass hint" "false" "$(has "$(node -e "
const m = require(process.argv[1]);
process.stdout.write(m.buildCarrascoBlockReason({ reason: 'no review' }, 3));
" "$HOOK" 2>/dev/null)" "bypass")"

# End to end: a repo with an uncommitted source file and the carrasco gate on
# but no review recorded, so gate-status reports "absent". HOME points at
# the temp dir so the TTL guard never touches the real ~/.claude.
# runhook <dir> -> the hook's stdout
runhook() {
  printf '{"cwd":"%s"}' "$(node -e "process.stdout.write(JSON.stringify(require('fs').realpathSync.native(process.argv[1])).slice(1,-1))" "$1")" \
    | HOME="$1" USERPROFILE="$1" node "$HOOK" 2>/dev/null
}
e2e_repo() {
  local d; d=$(mk)
  mkdir -p "$d/src"
  printf 'export const a = 1\n' > "$d/src/a.ts"
  printf '.superpowers/\n' > "$d/.gitignore"
  gitinit "$d"
  printf 'export const a = 2\n' >> "$d/src/a.ts"
  echo "$d"
}

# 29. block mode (default) -> decision:block
D=$(e2e_repo); cfg "$D" '{"verifyOnStop":{"minFiles":1},"reviewAggressiveness":{"enabled":true}}'
OUT=$(runhook "$D")
assert "block mode blocks on carrasco absent" "true" "$(has "$OUT" '"decision":"block"')"
assert "block mode writes no gate log" "false" "$([ -f "$D/.superpowers/gate-log.jsonl" ] && echo true || echo false)"
rm -rf "$D"

# 30. warn mode -> {} and one gate-log line. A plain repo (not a workspace
# harness) runs verify-all at cwd after the carrasco gate, so a fresh TTL guard
# keeps this case about the carrasco line alone.
D=$(e2e_repo); cfg "$D" '{"verifyOnStop":{"minFiles":1,"mode":"warn"},"reviewAggressiveness":{"enabled":true}}'
mkdir -p "$D/.claude/hooks-logs"; date > "$D/.claude/hooks-logs/verify-on-stop-fired.lock"
OUT=$(runhook "$D")
assert "warn mode returns {}" "{}" "$OUT"
assert "warn mode logs the would-be block" "1" "$(wc -l < "$D/.superpowers/gate-log.jsonl" 2>/dev/null | tr -d ' ')"
rm -rf "$D"

# 31. invalid mode -> behaves as block
D=$(e2e_repo); cfg "$D" '{"verifyOnStop":{"minFiles":1,"mode":"lixo"},"reviewAggressiveness":{"enabled":true}}'
assert "invalid mode blocks" "true" "$(has "$(runhook "$D")" '"decision":"block"')"
rm -rf "$D"

echo ""
echo "test-verify-on-stop: projectRoots glob and baseRef range (M3)"

# A workspace whose products are separate repositories ignored by the
# workspace git (projects/*/ in .gitignore), each with its own history.
WS=$(mk)
mkdir -p "$WS/projects/x/src" "$WS/projects/y/src" "$WS/projects/.hidden"
printf 'projects/*/\n' > "$WS/.gitignore"
printf '<project/>\n'         > "$WS/projects/x/pom.xml"
printf 'class A {}\n'         > "$WS/projects/x/src/A.java"
printf '{"name":"y"}'         > "$WS/projects/y/package.json"
printf 'export const y = 1\n' > "$WS/projects/y/src/y.ts"
gitinit "$WS/projects/x"
git -C "$WS/projects/x" branch -M main >/dev/null 2>&1
gitinit "$WS/projects/y"
gitinit "$WS"

# 32. "projects/*" expands to every (non-hidden) project directory
cfg "$WS" '{"verifyOnStop":{"projectRoots":["projects/*"]}}'
assert "glob projectRoots expands to both projects" '["projects/x","projects/y"]' \
  "$(hookcall resolveVerifyRoots '["{WS}", []]')"

# 32b. With a transcript, only declared roots holding a session edit are scanned
assert "session edits narrow declared roots" '["projects/y"]'   "$(hookcall rootsWithSessionEdits '[["{WS}/projects/x", "{WS}/projects/y"], ["{WS}/projects/y/src/y.ts"]]')"
# 32c. Without a transcript (null) every declared root is scanned
assert "no transcript keeps every declared root" '["projects/x","projects/y"]'   "$(hookcall rootsWithSessionEdits '[["{WS}/projects/x", "{WS}/projects/y"], null]')"

# 33. A modified .java inside an ignored nested repo is seen through the glob root
printf 'class A { int v; }\n' > "$WS/projects/x/src/A.java"
assert "ignored nested repo change is visible" "true" \
  "$(has "$(hookcall getChangedSourceFiles '["{WS}/projects/x", null]')" "projects/x/src/A.java")"

# 34. Once committed on a branch, the change disappears from the working tree...
git -C "$WS/projects/x" checkout -qb feature >/dev/null 2>&1
git -C "$WS/projects/x" -c user.email=t@t -c user.name=t commit -qam work >/dev/null 2>&1
assert "committed change invisible without baseRef" "false" \
  "$(has "$(hookcall getChangedSourceFiles '["{WS}/projects/x", null]')" "src/A.java")"
# 35. ... but the branch range still reports it
assert "committed change visible with baseRef" "true" \
  "$(has "$(hookcall getChangedSourceFiles '["{WS}/projects/x", "main"]')" "src/A.java")"
# 36. A baseRef that does not exist degrades to the working tree without failing
assert "missing baseRef degrades to working tree" "[]" \
  "$(hookcall getChangedSourceFiles '["{WS}/projects/x", "origin/main"]')"
# 37. getBaseRef reads the config
cfg "$WS" '{"verifyOnStop":{"baseRef":"origin/main"}}'
assert "getBaseRef reads verifyOnStop.baseRef" "origin/main"   "$(node -e "process.stdout.write(String(require(process.argv[1]).getBaseRef(process.argv[2])))" "$HOOK" "$WS" 2>/dev/null)"

rm -rf "$WS" 2>/dev/null

echo ""
echo "test-verify-on-stop: deep stack detection and fail-closed (M4)"

WS=$(mk)
mkdir -p "$WS/projects/api-x/backend/src" "$WS/projects/api-y/src"
printf '<project/>\n'  > "$WS/projects/api-x/backend/pom.xml"
printf 'class B {}\n'  > "$WS/projects/api-x/backend/src/B.java"
printf 'class C {}\n'  > "$WS/projects/api-y/src/C.java"

# 38. A manifest two levels below a declared root is found
assert "manifest at depth 2 is found" '"projects/api-x/backend"' \
  "$(hookcall findStackDirDeep '["{WS}/projects/api-x"]')"
# 39. The changed file's own manifest directory is what gets verified
assert "changed file resolves to its manifest dir" '["projects/api-x/backend"]' \
  "$(hookcall resolveDeclaredVerifyDirs '["{WS}/projects/api-x", ["{WS}/projects/api-x/backend/src/B.java"]]')"
# 40. A declared root with no manifest at all resolves to nothing (fail closed)
assert "declared root without manifest -> []" "[]" \
  "$(hookcall resolveDeclaredVerifyDirs '["{WS}/projects/api-y", ["{WS}/projects/api-y/src/C.java"]]')"
rm -rf "$WS" 2>/dev/null

# End to end: projects/api-y has a changed .java and no manifest anywhere.
m4_ws() {
  local d; d=$(mk)
  mkdir -p "$d/projects/api-y/src"
  printf 'class C {}\n' > "$d/projects/api-y/src/C.java"
  printf '.superpowers/\n' > "$d/.gitignore"
  gitinit "$d"
  printf 'class C { int v; }\n' > "$d/projects/api-y/src/C.java"
  echo "$d"
}

# 41. Declared + block -> blocks with the configuration-defect message
D=$(m4_ws); cfg "$D" '{"verifyOnStop":{"minFiles":1,"projectRoots":["projects/*"]}}'
OUT=$(runhook "$D")
assert "declared undetected stack blocks" "true" "$(has "$OUT" '"decision":"block"')"
assert "block names the configuration defect" "true" "$(has "$OUT" "configuration defect")"
rm -rf "$D"

# 42. Declared + warn -> {} and a gate-log line
D=$(m4_ws); cfg "$D" '{"verifyOnStop":{"minFiles":1,"mode":"warn","projectRoots":["projects/*"]}}'
OUT=$(runhook "$D")
assert "declared undetected stack in warn returns {}" "{}" "$OUT"
assert "declared undetected stack in warn is logged" "true" \
  "$(has "$(cat "$D/.superpowers/gate-log.jsonl" 2>/dev/null)" "undetected stack")"
rm -rf "$D"

# 43. Not declared -> fails open exactly as before
D=$(m4_ws); cfg "$D" '{"verifyOnStop":{"minFiles":1}}'
assert "undeclared undetected stack fails open" "{}" "$(runhook "$D")"
rm -rf "$D"

echo ""
echo "test-verify-on-stop: infrastructure files re-included (M6)"

# excl <path> -> what shouldExclude returns for that path
excl() {
  node -e "const m=require(process.argv[1]);process.stdout.write(String(m.shouldExclude(process.argv[2])))" "$HOOK" "$1" 2>/dev/null
}

assert "helm values.yaml is NOT excluded" "false" "$(excl helm/eprocessos/values.yaml)"
assert "nested chart template is NOT excluded" "false" "$(excl deploy/charts/api/templates/deployment.yml)"
assert "k8s manifest is NOT excluded" "false" "$(excl k8s/prod/ingress.yaml)"
assert "flyway json is NOT excluded" "false" "$(excl db/migration/V2__seed.json)"
assert "application.yml is NOT excluded" "false" "$(excl src/main/resources/application.yml)"
assert "package.json is excluded" "true" "$(excl package.json)"
assert "README.md is excluded" "true" "$(excl README.md)"
assert "a root docker-compose.yml is still excluded" "true" "$(excl docker-compose.yml)"
assert "a plain .github workflow yaml is still excluded" "true" "$(excl .github/workflows/ci.yml)"

echo ""
echo "test-verify-on-stop: outside a workspace harness nothing changes"

# A monorepo with a root package.json and packages/a/package.json is a plain
# project, not a workspace harness: no projectRoots, a stack manifest at cwd.
D=$(mk)
mkdir -p "$D/packages/a/src"
printf '{"name":"root"}' > "$D/package.json"
printf '{"name":"a"}'    > "$D/packages/a/package.json"
printf 'export const a = 1\n' > "$D/packages/a/src/a.ts"
WS="$D"
assert "monorepo is not a workspace harness" "false" "$(hookcall isWorkspaceHarness '["{WS}"]')"
assert "monorepo edit in packages/a still verifies the root" '["."]' \
  "$(hookcall resolveVerifyRoots '["{WS}", ["{WS}/packages/a/src/a.ts"]]')"
rm -rf "$D"

# A root with no manifest and no projects/ is a plain project too: verify-all
# must still run at cwd instead of being skipped in silence.
D=$(mk)
mkdir -p "$D/src"
printf 'export const a = 1\n' > "$D/src/a.ts"
printf '.superpowers/\n' > "$D/.gitignore"
gitinit "$D"
printf 'export const a = 2\n' >> "$D/src/a.ts"
cfg "$D" '{"verifyOnStop":{"minFiles":1,"mode":"warn"}}'
WS="$D"
assert "manifest-less root without projects/ is not a workspace" "false" "$(hookcall isWorkspaceHarness '["{WS}"]')"
ERR=$(printf '{"cwd":"%s"}' "$(node -e "process.stdout.write(JSON.stringify(require('fs').realpathSync.native(process.argv[1])).slice(1,-1))" "$D")" \
  | HOME="$D" USERPROFILE="$D" node "$HOOK" 2>&1 >/dev/null)
assert "manifest-less plain root is not skipped" "false" "$(has "$ERR" "no stack manifest")"
assert "manifest-less plain root runs verify-all at cwd" "true" "$(has "$ERR" "Running verify-all")"
rm -rf "$D"

# Workspace harness detection: declared projectRoots, or no manifest + projects/.
D=$(mk); mkdir -p "$D/projects/p"; WS="$D"
assert "no manifest + projects/ is a workspace harness" "true" "$(hookcall isWorkspaceHarness '["{WS}"]')"
printf '{"name":"root"}' > "$D/package.json"
assert "manifest + projects/ is not a workspace harness" "false" "$(hookcall isWorkspaceHarness '["{WS}"]')"
cfg "$D" '{"verifyOnStop":{"projectRoots":["projects/*"]}}'
assert "declared projectRoots makes a workspace harness" "true" "$(hookcall isWorkspaceHarness '["{WS}"]')"
rm -rf "$D"

echo ""
echo "test-verify-on-stop: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
