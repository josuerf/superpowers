#!/usr/bin/env bash
# Tests for context-engine.js blast radius from catalog/data/<repo>.impact.json:
# present -> its consumers fill blast_radius; absent -> the git-grep result,
# unchanged.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$REPO/hooks/context-engine.js"

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

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

# mkrepo -> repo whose last commit changes widget.js, which consumer.js imports
mkrepo() {
  local d
  d=$(mktemp -d "${TMPDIR:-/tmp}/ce-test.XXXXXX")/shop
  mkdir -p "$d"
  git -C "$d" init -q; git -C "$d" config core.autocrlf false
  echo "module.exports = 1;" > "$d/widget.js"
  echo "const w = require('./widget');" > "$d/consumer.js"
  git -C "$d" add .; git -C "$d" commit -q -m first
  echo "module.exports = 2;" > "$d/widget.js"
  git -C "$d" commit -qam second
  printf '%s' "$d"
}

# blast <cwd> <file> -> JSON of blast_radius[file] after one hook run
blast() {
  local h; h=$(mktemp -d)
  node -e "process.stdout.write(JSON.stringify({cwd:process.argv[1]}))" "$1" | HOME="$h" USERPROFILE="$h" node "$HOOK" >/dev/null
  node -e "
const s=JSON.parse(require('fs').readFileSync(require('path').join(process.argv[1],'context-snapshot.json'),'utf8'));
process.stdout.write(JSON.stringify(s.blast_radius[process.argv[2]]));" "$1" "$2"
  rm -rf "$h"
}

echo "test-context-engine-impact"

# 1. No impact file -> git grep result (consumer.js imports widget)
D=$(mkrepo)
assert "absent -> git grep blast radius" '["consumer.js"]' "$(blast "$D" widget.js)"
rm -rf "$(dirname "$D")"

# 2. catalog present but no impact file for this repo -> unchanged
D=$(mkrepo); mkdir -p "$D/catalog/data"; echo '{}' > "$D/catalog/data/shop.json"
assert "catalog without impact.json -> git grep" '["consumer.js"]' "$(blast "$D" widget.js)"
rm -rf "$(dirname "$D")"

# 3. impact.json with a files map -> its consumers
D=$(mkrepo); mkdir -p "$D/catalog/data"
echo '{"files":{"widget.js":["api-x/src/Client.java",{"path":"api-y/Dao.java"}]}}' > "$D/catalog/data/shop.impact.json"
assert "files map -> consumers" '["api-x/src/Client.java","api-y/Dao.java"]' "$(blast "$D" widget.js)"
rm -rf "$(dirname "$D")"

# 4. impact.json as a bare array -> repo-level consumers
D=$(mkrepo); mkdir -p "$D/catalog/data"
echo '["api-z"]' > "$D/catalog/data/shop.impact.json"
assert "array -> consumers" '["api-z"]' "$(blast "$D" widget.js)"
rm -rf "$(dirname "$D")"

# 5. { consumers } form, catalog found from the workspace above a nested repo path
assert "consumers form, projects/<repo> path" '["api-q"]' "$(node -e "
const fs=require('fs'),os=require('os'),path=require('path');
const m=require(process.argv[1]);
const ws=fs.mkdtempSync(path.join(os.tmpdir(),'ce-ws-'));
fs.mkdirSync(path.join(ws,'catalog','data'),{recursive:true});
fs.writeFileSync(path.join(ws,'catalog','data','api-contabil.impact.json'),JSON.stringify({consumers:[{repo:'api-q'}]}));
const dir=m.findCatalogDataDir(path.join(ws,'projects'));
process.stdout.write(JSON.stringify(m.impactConsumersFor('projects/api-contabil/src/A.java', ws, dir)));
fs.rmSync(ws,{recursive:true,force:true});
" "$HOOK")"

# 6. Malformed impact.json -> falls back to git grep
D=$(mkrepo); mkdir -p "$D/catalog/data"; echo '{broken' > "$D/catalog/data/shop.impact.json"
assert "malformed impact.json -> git grep" '["consumer.js"]' "$(blast "$D" widget.js)"
rm -rf "$(dirname "$D")"

echo ""
echo "test-context-engine-impact: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
