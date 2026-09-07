#!/usr/bin/env bash
# scripts/test-db.sh — bring up the throwaway vitest Supabase stack (project
# mgr_test, ports 5435x, config in tests/supabase) and write .env.test.local,
# which vitest loads over .env.local. Always resets the database, so run it
# after editing supabase/migrations/00001_baseline.sql; the app stack on
# 5434x is untouched. CI skips this: it starts one fresh stack per run.
set -euo pipefail
cd "$(dirname "$0")/.."
WD=tests/supabase
bunx supabase start --workdir "$WD" -x studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,supavisor,postgres-meta
bunx supabase db reset --workdir "$WD"
{
  bunx supabase status --workdir "$WD" -o env | node scripts/supabase-env.mjs
  echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54352/postgres"
  echo "MGR_TEST_STACK=1"
} > .env.test.local
echo "wrote .env.test.local (test stack: API 54351, DB 54352)"
