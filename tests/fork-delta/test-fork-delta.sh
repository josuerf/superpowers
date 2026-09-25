#!/usr/bin/env bash
# Guards FORK-DELTA.md (plan M §4.3): every file the fork modified that the
# upstream also maintains (status M in `git diff upstream/main..HEAD`) must
# have exactly one row in the table, and every row must still be an M file.
# Each such file is a future sync-upstream conflict; the table keeps that
# list visible and deliberate.
#
# FORK_DELTA_REF overrides the upstream ref (default upstream/main).
# FORK_DELTA_FILE overrides the table file (default <repo>/FORK-DELTA.md).
set -euo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REF="${FORK_DELTA_REF:-upstream/main}"
TABLE="${FORK_DELTA_FILE:-$REPO_ROOT/FORK-DELTA.md}"

cd "$REPO_ROOT"

if ! git rev-parse --verify -q "$REF^{commit}" >/dev/null; then
    echo "SKIP: ref '$REF' not found. Add the upstream remote and fetch it:"
    echo "  git remote add upstream https://github.com/obra/superpowers.git && git fetch upstream"
    exit 0
fi

if [[ ! -f "$TABLE" ]]; then
    echo "  [FAIL] $TABLE does not exist"
    exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git diff --name-only "$REF..HEAD" --diff-filter=M | sort > "$tmp/actual"
# Rows look like: | `path` | delta | why | marker |
sed -n 's/^| `\([^`]*\)` |.*/\1/p' "$TABLE" | sort > "$tmp/listed-all"
sort -u "$tmp/listed-all" > "$tmp/listed"

FAILURES=0
fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

while IFS= read -r f; do
    [[ -n "$f" ]] && fail "M file not listed in FORK-DELTA.md: $f"
done < <(comm -23 "$tmp/actual" "$tmp/listed")

while IFS= read -r f; do
    [[ -n "$f" ]] && fail "listed in FORK-DELTA.md but no longer M vs $REF: $f"
done < <(comm -13 "$tmp/actual" "$tmp/listed")

while IFS= read -r f; do
    [[ -n "$f" ]] && fail "listed more than once in FORK-DELTA.md: $f"
done < <(uniq -d "$tmp/listed-all")

total=$(wc -l < "$tmp/actual" | tr -d ' ')
if [[ $FAILURES -gt 0 ]]; then
    echo "FAIL: $FAILURES problem(s); $total M file(s) vs $REF"
    exit 1
fi
echo "  [PASS] FORK-DELTA.md lists exactly the $total M file(s) vs $REF"
