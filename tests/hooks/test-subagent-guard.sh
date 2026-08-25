#!/usr/bin/env bash
# Tests for subagent-guard.js skill-scope enforcement.
#
# The guard exists to stop a focused subagent from turning itself into a
# workflow orchestrator, so it must block superpowers-prepared *process*
# skills. It must NOT block:
#   - implementation-support skills (frontend-design,
#     vercel-react-best-practices) — domain knowledge, not workflow control
#   - skills belonging to the user's project or workspace — outside this
#     plugin's authority entirely
#
# A previous version blocked all three: SKILL_NAMES listed the two support
# skills, and the pattern /I'm using the .+ skill/i matched any name at all.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/subagent-guard.js"

PASS=0
FAIL=0

# verdict <message> -> prints "block" if the guard blocks, "pass" otherwise
verdict() {
  printf '%s' "{\"last_assistant_message\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"),\"agent_id\":\"t\",\"agent_type\":\"t\"}" \
    | node "$HOOK" \
    | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(s.includes('\"block\"')?'block':'pass'))"
}

# assert <description> <expected> <message>
assert() {
  local got; got="$(verdict "$3")"
  if [ "$2" = "$got" ]; then
    PASS=$((PASS + 1))
    echo "  ok   - $1 (got $got)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL - $1 (expected $2, got '$got')"
  fi
}

echo "test-subagent-guard: process skills are blocked"
assert "brainstorming"                "block" "I'm using the brainstorming skill to explore this."
assert "writing-plans"                "block" "Now invoking writing-plans to structure it."
assert "subagent-driven-development"  "block" "using subagent-driven-development for this"
assert "process skill via Skill()"    "block" 'Skill("superpowers-prepared:requesting-code-review")'
assert "process skill via skill: key" "block" "skill: superpowers-prepared:executing-plans"
assert "carrasco-review"              "block" "invoking carrasco-review on the diff"

echo ""
echo "test-subagent-guard: implementation-support skills are allowed"
assert "frontend-design"              "pass"  "I'm using the frontend-design skill for the layout."
assert "vercel-react-best-practices"  "pass"  "Applying vercel-react-best-practices to the component."
assert "support skill via Skill()"    "pass"  'Skill("frontend-design")'

echo ""
echo "test-subagent-guard: project and workspace skills are allowed"
assert "project skill by name"        "pass"  "I'm using the jira-equiplano skill to move the card."
assert "arbitrary workspace skill"    "pass"  "invoking the acme-deploy-checklist skill now"
assert "context7"                     "pass"  "using context7 to check the lib docs"

echo ""
echo "test-subagent-guard: the plugin prefix does not override the allowlist"
assert "prefixed support skill"     "pass"  "Invoke the superpowers-prepared frontend-design skill for this UI."
assert "prefixed support skill 2"   "pass"  "Invoke the superpowers-prepared vercel-react-best-practices skill."
assert "prefixed generic"           "block" "Invoke the superpowers-prepared skill"
assert "prefixed process skill"     "block" "Invoke the superpowers-prepared brainstorming skill"

echo ""
echo "test-subagent-guard: skill names that are ordinary English words"
assert "refactoring as plain prose"  "pass"  "I started refactoring the auth module and all tests pass."
assert "deliberation as plain prose" "pass"  "Deliberation on the tradeoffs led me to pick B."
assert "refactoring as a skill"      "block" "I will be spawning the refactoring skill to restructure."
assert "deliberation as a skill"     "block" "invoking the deliberation skill now"

echo ""
echo "test-subagent-guard: ordinary output is not a violation"
assert "plain report"                 "pass"  "Implemented the parser and ran 14/14 tests, all passing."
assert "bare mention without verb"    "pass"  "The brainstorming doc lives in docs/."

echo ""
echo "test-subagent-guard: the block message teaches the correct scope"
REASON="$(printf '%s' '{"last_assistant_message":"I'"'"'m using the brainstorming skill.","agent_id":"t","agent_type":"t"}' | node "$HOOK")"
for needle in "process" "frontend-design" "vercel-react-best-practices" "project or workspace"; do
  if printf '%s' "$REASON" | grep -qF -- "$needle"; then
    PASS=$((PASS + 1)); echo "  ok   - block reason mentions '$needle'"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL - block reason omits '$needle'"
  fi
done

echo ""
echo "test-subagent-guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
