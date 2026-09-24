#!/usr/bin/env bash
# scripts/test-db.sh — bring up the throwaway vitest Supabase stack (project
# mgr_test, ports 5435x, config in tests/supabase) and write .env.test.local,
# which vitest loads over .env.local. Always resets the database, so run it
# after editing supabase/migrations/00001_baseline.sql; the app stack on
# 5434x is untouched. CI skips this: it starts one fresh stack per run.
set -euo pipefail
# Parallel sessions share this database. Run one reset at a time under a
# kernel lock (released if the holder dies, so it never goes stale).
# ponytail: macOS lockf only; add flock when this runs on Linux.
if [ -z "${MGR_TEST_DB_LOCKED:-}" ] && command -v lockf >/dev/null; then
  MGR_TEST_DB_LOCKED=1 exec lockf -t 900 /tmp/mgr-test-db.lock bash "$0" "$@"
fi
cd "$(dirname "$0")/.."
WD=tests/supabase
bunx supabase start --workdir "$WD" -x studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,supavisor,postgres-meta
# A reset under another session's vitest run fails it with errors that read as
# broken code. Wait for every vitest in this repo and its worktrees to finish.
# Watch mode never exits, so give up after ten minutes rather than reset
# under it.
main=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
vitest="$main/.*node_modules/\.bin/vitest"
pgrep -f "$vitest" >/dev/null && echo "test-db: waiting for a running vitest to finish"
for _ in $(seq 300); do
  pgrep -f "$vitest" >/dev/null || break
  sleep 2
done
if pgrep -f "$vitest" >/dev/null; then
  echo "test-db: still running after 10 minutes; stop these and retry:" >&2
  pgrep -fl "$vitest" >&2
  exit 1
fi
bunx supabase db reset --workdir "$WD"
# `db reset` rebuilds the schema behind PostgREST's back, and PostgREST caches
# it at boot. Without this the whole suite fails with "Could not find the table
# 'public.breweries' in the schema cache" — a stale cache that reads as a
# hundred broken tests.
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54352 -U postgres -d postgres -qc "NOTIFY pgrst, 'reload schema';"
{
  bunx supabase status --workdir "$WD" -o env | node scripts/supabase-env.mjs
  echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54352/postgres"
  echo "MGR_TEST_STACK=1"
} > .env.test.local
bash scripts/wait-rest.sh
echo "wrote .env.test.local (test stack: API 54351, DB 54352)"
