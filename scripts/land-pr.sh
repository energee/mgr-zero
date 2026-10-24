#!/usr/bin/env bash
# scripts/land-pr.sh — land one PR: sync it with origin/main in its worktree,
# prove it locally, push, wait for CI (rerunning infra-only failures), and with
# --merge merge it. --sync-only only synchronizes main and generated files, so
# conflicts can be repaired before GitHub can run the review workflow.
#
# Local proof: tsc, lint, the PR's own test files, every test file that names a
# SQL function the PR's migrations define (CI runs the whole suite, so an old
# test pinned to the old behavior fails there otherwise), and the docs checks.
# The database tests run against the shared test database as scripts/test-db.sh
# builds it (reset when the migrations changed), under one exclusive lock held
# from the reset through the vitest run, so the identity guard in
# tests/test-db-lock.setup.ts sees this PR's migrations and no reset intervenes.
#
# Exit codes: 2 merge conflict (resolve by hand, commit, rerun), 3 local proof
# failed (including an added migration that sorts before main's newest, which
# `supabase db push` refuses: rename it later, rerun), 4 CI failed for a real
# reason, 5 push did not land, 6 main gained a migration since the sync (rerun
# to resync), 7 no claude-code-review.yml run passed both its simplify and
# claude-review jobs (read that run; the `review` label reruns it).
# Env: CLAUDE_SESSION_URL
# (added as a Claude-Session trailer to the regeneration commit when set).
set -uo pipefail
n=${1:?usage: scripts/land-pr.sh <pr> [--merge|--sync-only]}; do_merge=${2:-}
ROOT=$(cd "$(dirname "$0")/.." && git rev-parse --path-format=absolute --git-common-dir | xargs dirname)
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

# Every human PR merges after one claude-code-review.yml run in which both jobs
# succeeded: `simplify` (Claude Code's /simplify, which pushes its fixes to the
# branch) and `claude-review`. Job success, not a comment, is the signal: the
# review plugin posts nothing when no finding clears its confidence bar. That
# workflow skips drafts, so mark the PR ready, or relabel it when no run passed,
# then wait for the run before syncing: the sync below merges simplify's push.
reviewed() {
  local id
  for id in $(gh run list --workflow claude-code-review.yml --branch "$b" --limit 10 --json databaseId --jq '.[].databaseId'); do
    [ "$(gh run view "$id" --json jobs --jq '[.jobs[]|select(.conclusion=="success")|.name]|sort|join(",")')" = claude-review,simplify ] && return 0
  done
  return 1
}
running() { [ -n "$(gh run list --workflow claude-code-review.yml --branch "$b" --json status --jq '.[]|select(.status!="completed")|.status')" ]; }
# Exempt, as the workflow skips them: bot PRs, and PRs editing the workflow
# itself (claude-code-action refuses a workflow file that differs from main's).
gated=$(gh pr view "$n" --json author --jq '.author.is_bot|not') || exit 1
gh pr diff "$n" --name-only | grep -qx .github/workflows/claude-code-review.yml && gated=false
if [ "$do_merge" != --sync-only ] && [ "$gated" = true ] && ! reviewed; then
  if [ "$(gh pr view "$n" --json isDraft --jq .isDraft)" = true ]; then
    gh pr ready "$n" || exit 1
  else
    # Only a fresh add fires `labeled`, so drop the label first; that fails
    # harmlessly when the PR lacks it, and the add is the step that must work.
    gh pr edit "$n" --remove-label review >/dev/null 2>&1
    gh pr edit "$n" --add-label review >/dev/null || exit 1
  fi
  sleep 30
  for _ in $(seq 40); do running || break; sleep 30; done
  reviewed || { echo "#$n has no Claude Code Review run where simplify and claude-review both succeeded; read that run"; exit 7; }
fi

git fetch -q origin
# The remote may have moved (another session, GitHub's Update branch): merge it, never reset.
git merge --no-edit -q "origin/$b" >/dev/null 2>&1 || { echo "CONFLICT with origin/$b"; exit 2; }
if ! git merge --no-edit -q origin/main >/dev/null 2>&1; then
  if [ "$(git diff --name-only --diff-filter=U)" = "supabase/migrations.lock.json" ]; then
    git checkout --theirs supabase/migrations.lock.json && bun run migrations:lock >/dev/null \
      && git add supabase/migrations.lock.json && git commit -q --no-edit || exit 3
  else
    echo "CONFLICT:"; git diff --name-only --diff-filter=U; exit 2
  fi
fi
bun run migrations:lock || exit 3
bun run docs:api || exit 3
if [ -n "$(git status --porcelain)" ]; then
  git add -A supabase/migrations.lock.json content/docs || exit 3
  git commit -q -m "chore: regenerate migration lock and API reference after syncing main${CLAUDE_SESSION_URL:+

Claude-Session: $CLAUDE_SESSION_URL}" || exit 3
fi

if [ "$do_merge" = --sync-only ]; then
  echo "synced #$n with origin/main; no proof, push, or merge performed"
  exit 0
fi

bun scripts/check-migration-order.ts origin/main || exit 3
migs=$(git diff --name-only origin/main...HEAD -- 'supabase/migrations/*.sql')
tests=$(git diff --name-only --diff-filter=d origin/main...HEAD -- 'tests/*.test.ts')
for fn in $(cat $migs /dev/null | grep -oiE "create (or replace )?function [a-z_.]+" | awk '{print $NF}' | sed 's/.*\.//' | sort -u); do
  tests="$tests $(git grep -l -w "$fn" -- 'tests/*.test.ts')"
done
tests=$(echo $tests | tr ' ' '\n' | sort -u | tr '\n' ' ')
log=$(mktemp)
# bunx drops the inherited lock descriptor; the direct vitest binary keeps it.
bunx tsc --noEmit && bun run lint >/dev/null 2>&1 \
  && perl scripts/test-db-lock.pl ex bash -c 'bash scripts/test-db.sh --locked-reset && node_modules/.bin/vitest run "$@"' \
    land-pr $tests tests/migrations-applied.test.ts tests/docs.test.ts tests/api-docs.test.ts >"$log" 2>&1
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
