#!/usr/bin/env bash
# scripts/test-db.sh — bring up the throwaway vitest Supabase stack (project
# mgr_test, ports 5435x, config in tests/supabase) and write .env.test.local,
# which vitest loads over .env.local. Resets the database only when the
# migrations (or the stack config) changed since the last reset, or when
# MGR_TEST_DB_RESET=1 asks for a clean one. The app stack on 5434x is
# untouched. CI skips this: it starts one fresh stack per run.
#
# Parallel sessions share this database. The reset runs under
# scripts/test-db-lock.pl held exclusive, and every vitest run holds that lock
# shared (tests/test-db-lock.setup.ts), so a reset never lands under a running
# suite and a suite never starts mid-reset.
set -euo pipefail
cd "$(dirname "$0")/.."
WD=tests/supabase
psql_test() { PGPASSWORD=postgres psql -h 127.0.0.1 -p 54352 -U postgres -d postgres -qtAc "$1"; }
# Hash of everything a reset builds from: the migrations (names and contents)
# and the stack config; seed is off. It is stored as the database's comment,
# because worktrees on different branches share this one database.
want="mgr-schema $({ ls supabase/migrations; cat supabase/migrations/*.sql "$WD/supabase/config.toml"; } | git hash-object --stdin)"
have() { psql_test "select shobj_description(oid, 'pg_database') from pg_database where datname = 'postgres'"; }

if [ "${1:-}" = --locked-reset ]; then
  # Another session may have reset while this one waited for the lock.
  [ "$(have)" = "$want" ] && [ -z "${MGR_TEST_DB_RESET:-}" ] && exit 0
  bunx supabase db reset --workdir "$WD"
  # PostgREST cached the old schema; wait-rest.sh reloads it and waits until
  # it serves, or the suite fails with "not in the schema cache" errors.
  bash scripts/wait-rest.sh
  psql_test "comment on database postgres is '$want'"
  exit 0
fi

bunx supabase start --workdir "$WD" -x studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,supavisor,postgres-meta
{
  bunx supabase status --workdir "$WD" -o env | node scripts/supabase-env.mjs
  echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54352/postgres"
  echo "MGR_TEST_STACK=1"
} > .env.test.local
if [ "$(have)" = "$want" ] && [ -z "${MGR_TEST_DB_RESET:-}" ]; then
  echo "test-db: schema unchanged; skipping reset"
else
  perl scripts/test-db-lock.pl ex bash scripts/test-db.sh --locked-reset
fi
echo "wrote .env.test.local (test stack: API 54351, DB 54352)"
