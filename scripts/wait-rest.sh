#!/usr/bin/env bash
# scripts/wait-rest.sh — block until PostgREST has reloaded its schema cache.
#
# `supabase db reset` returns as soon as Postgres is done, but PostgREST only
# picks up the new schema when its reload lands. A test suite that starts in
# that window fails with "Could not find the table 'public.breweries' in the
# schema cache" or PGRST202 — a race that looks like a broken migration.
#
# Nudge the reload, then poll a known table until it answers.
set -euo pipefail
cd "$(dirname "$0")/.."

key=$(grep -m1 '^SUPABASE_SECRET_KEY=' .env.test.local | cut -d= -f2-)
url=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' .env.test.local | cut -d= -f2-)
psql "${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54352/postgres}" \
  -qc "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true

for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    "$url/rest/v1/breweries?select=id&limit=1" \
    -H "apikey: $key" -H "Authorization: Bearer $key" || true)
  [ "$code" = "200" ] && exit 0
  sleep 1
done

echo "wait-rest: PostgREST did not serve public.breweries within 60s (last: ${code:-none})" >&2
exit 1
