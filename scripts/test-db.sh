#!/usr/bin/env bash
# scripts/test-db.sh — bring up the throwaway vitest Supabase stack (project
# mgr_test, ports 5435x, config in tests/supabase) and write .env.test.local,
# which vitest loads over .env.local. Resets the database only when the
# migrations (or the stack config) changed since the last reset, or when
# MGR_TEST_DB_RESET=1 asks for a clean one. The app stack on 5434x is
# untouched. CI skips this: it starts one fresh stack per run.
#
# Parallel sessions share this database. The reset runs under
# scripts/test-db-lock.pl held exclusive, and the database Vitest project holds
# that lock shared (tests/test-db-lock.setup.ts), so a reset never lands under
# database-backed suites and those suites never start mid-reset.
set -euo pipefail
cd "$(dirname "$0")/.."
# Lock startup and env publication too: start can rebuild a stopped stack.
# --locked-reset is internal, and cannot be used to bypass the lock.
if [ "${1:-}" != --locked-reset ]; then
  exec perl scripts/test-db-lock.pl ex bash scripts/test-db.sh --locked-reset
fi
perl scripts/test-db-lock.pl check
WD=tests/supabase
scripts/test-stack-templates.sh
psql_test() { PGPASSWORD=postgres psql -h 127.0.0.1 -p 54352 -U postgres -d postgres -qtAc "$1"; }
# Keep the existing mgr-schema migration/config fingerprint in the database.
want=$(node scripts/test-db-schema.mjs fingerprint)
have() { psql_test "select shobj_description(oid, 'pg_database') from pg_database where datname = 'postgres'"; }

bunx supabase start --workdir "$WD" -x studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,supavisor,postgres-meta
# Replace a worktree's env symlink rather than changing another checkout's file.
env_file=$(mktemp .env.test.local.XXXXXX)
trap 'rm -f "$env_file"' EXIT
{
  bunx supabase status --workdir "$WD" -o env | node scripts/supabase-env.mjs
  echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54352/postgres"
  echo "MGR_TEST_STACK=1"
} > "$env_file"
mv "$env_file" .env.test.local
if [ "$(have)" = "$want" ] && [ -z "${MGR_TEST_DB_RESET:-}" ] &&
  [ "$(psql_test "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname ~ '^mgr_test_identity_[a-f0-9]{32}$'")" = 1 ]; then
  echo "test-db: schema unchanged; skipping reset"
else
  bunx supabase db reset --local --workdir "$WD"
  node scripts/test-db-schema.mjs install
  # Readiness must execute this reset's new identity RPC, not an old table.
  bash scripts/wait-rest.sh
fi
node scripts/test-db-schema.mjs check
echo "wrote .env.test.local (test stack: API 54351, DB 54352)"
