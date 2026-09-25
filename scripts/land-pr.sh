#!/usr/bin/env bash
# scripts/land-pr.sh — land one PR: sync it with origin/main in its worktree,
# prove it locally, push, wait for CI (rerunning infra-only failures), and with
# --merge merge it. One PR per call; chain calls to land a queue in order:
#   for n in 562 570 560; do scripts/land-pr.sh $n --merge || break; done
#
# Local proof: tsc, lint, the PR's own test files, every test file that names a
# SQL function the PR's migrations define (CI runs the whole suite, so an old
# test pinned to the old behavior fails there otherwise), and the docs checks.
# The PR's migrations are applied to the shared test database first; DDL that
# was already applied ("already exists") counts as applied.
#
# Exit codes: 2 merge conflict (resolve by hand, commit, rerun), 3 local proof
# failed, 4 CI failed for a real reason, 5 push did not land, 6 main gained a
# migration since the sync (rerun to resync).
# Env: TEST_DATABASE_URL (default: the local test stack), CLAUDE_SESSION_URL
# (added as a Claude-Session trailer to the regeneration commit when set).
set -uo pipefail
n=${1:?usage: scripts/land-pr.sh <pr> [--merge]}; do_merge=${2:-}
ROOT=$(cd "$(dirname "$0")/.." && git rev-parse --path-format=absolute --git-common-dir | xargs dirname)
DB=${TEST_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54352/postgres}
b=$(gh pr view "$n" --json headRefName --jq .headRefName) || exit 1
wt=$(git -C "$ROOT" worktree list --porcelain | awk -v b="refs/heads/$b" '/^worktree/{w=$2} $0=="branch "b{print w}')
if [ -z "$wt" ]; then
  "$ROOT/scripts/worktree.sh" "$b" "origin/$b" >/dev/null 2>&1 || exit 1
  wt=$ROOT/.agents/worktrees/${b//\//-}
fi
cd "$wt" || exit 1
echo "== #$n $b @ $wt"
[ "$(git branch --show-current)" = "$b" ] || { echo "wrong branch"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "dirty tree"; exit 1; }

git fetch -q origin
# The remote may have moved (another session, GitHub's Update branch): merge it, never reset.
git merge --no-edit -q "origin/$b" >/dev/null 2>&1 || { echo "CONFLICT with origin/$b"; exit 2; }
if ! git merge --no-edit -q origin/main >/dev/null 2>&1; then
  if [ "$(git diff --name-only --diff-filter=U)" = "supabase/migrations.lock.json" ]; then
    git checkout --theirs supabase/migrations.lock.json && bun run migrations:lock >/dev/null \
      && git add supabase/migrations.lock.json && git commit -q --no-edit
  else
    echo "CONFLICT:"; git diff --name-only --diff-filter=U; exit 2
  fi
fi
bun run migrations:lock >/dev/null 2>&1
bun run docs:api >/dev/null 2>&1
if [ -n "$(git status --porcelain)" ]; then
  git add -A supabase/migrations.lock.json content/docs
  git commit -q -m "chore: regenerate migration lock and API reference after syncing main${CLAUDE_SESSION_URL:+

Claude-Session: $CLAUDE_SESSION_URL}"
fi

migs=$(git diff --name-only origin/main...HEAD -- 'supabase/migrations/*.sql')
tests=$(git diff --name-only --diff-filter=d origin/main...HEAD -- 'tests/*.test.ts')
for m in $migs; do
  out=$(psql "$DB" -v ON_ERROR_STOP=1 -q -f "$m" 2>&1 >/dev/null) && continue
  echo "$out" | grep -q "already exists" && { echo "already applied: $m"; continue; }
  echo "$out"; echo "migration failed: $m"; exit 3
done
for fn in $(cat $migs /dev/null | grep -oiE "create (or replace )?function [a-z_.]+" | awk '{print $NF}' | sed 's/.*\.//' | sort -u); do
  tests="$tests $(git grep -l -w "$fn" -- 'tests/*.test.ts')"
done
tests=$(echo $tests | tr ' ' '\n' | sort -u | tr '\n' ' ')
log=$(mktemp)
bunx tsc --noEmit && bun run lint >/dev/null 2>&1 \
  && bunx vitest run $tests tests/migrations-applied.test.ts tests/docs.test.ts tests/api-docs.test.ts >"$log" 2>&1
status=$?
grep -E "Test Files|Tests |FAIL|×" "$log"
[ $status = 0 ] || { echo "local proof failed (full log: $log)"; exit 3; }

git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$b")" ]; then
  # The pre-push hook runs tests and can time out under load: retry once.
  git push -q origin HEAD >/dev/null 2>&1 || git push -q origin HEAD >/dev/null 2>&1
  git fetch -q origin
fi
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$b")" ] || { echo "push did not land"; exit 5; }
head=$(git rev-parse HEAD); echo "pushed $head"

sleep 30
for attempt in 1 2 3; do
  gh pr checks "$n" --watch --interval 30 >/dev/null 2>&1
  # Vercel preview builds are rate limited on this plan; they are not the gate.
  bad=$(gh pr checks "$n" 2>/dev/null | awk -F'\t' '$2=="fail" && $1!="Vercel"{print $1" "$4}')
  [ -z "$bad" ] && break
  run=$(echo "$bad" | grep -oE 'runs/[0-9]+' | head -1 | cut -d/ -f2)
  failed=$([ -n "$run" ] && gh run view "$run" --log-failed 2>/dev/null)
  # Rerun only when the failure is infra (Docker Hub rate limit, port clash, container start).
  if [ "$attempt" -lt 3 ] && echo "$failed" | grep -qE "toomanyrequests|port is already allocated|failed to start container" \
     && ! echo "$failed" | grep -qE "AssertionError| FAIL "; then
    echo "infra failure, rerunning $run"; gh run rerun "$run" --failed >/dev/null; sleep 60; continue
  fi
  echo "CI FAIL:"; echo "$bad"; exit 4
done
echo "CI green"

if [ "$do_merge" = --merge ]; then
  git fetch -q origin
  # db push applies migrations in timestamp order: a migration landing on main after
  # this sync must be merged in (and this PR's timestamp checked) before merging.
  [ -z "$(git diff --name-only HEAD...origin/main -- supabase)" ] || { echo "main gained supabase changes since sync; rerun"; exit 6; }
  gh pr merge "$n" --merge --match-head-commit "$head" && gh pr view "$n" --json state --jq .state
fi
