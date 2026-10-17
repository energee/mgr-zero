#!/usr/bin/env bash
# scripts/wait-rest.sh — block until PostgREST has reloaded its schema cache.
#
# `supabase db reset` returns as soon as Postgres is done, but PostgREST only
# picks up the new schema when its reload lands. A test suite that starts in
# that window fails with "Could not find the table 'public.breweries' in the
# schema cache" or PGRST202 — a race that looks like a broken migration.
#
# The reset installs and reloads a new identity RPC; wait for that exact reset.
set -euo pipefail
cd "$(dirname "$0")/.."

# test-db-schema.mjs reads the pinned test env file, never inherited app URLs.

for _ in $(seq 1 60); do
  if actual=$(node scripts/test-db-schema.mjs check 2>&1); then
    echo "$actual"
    exit 0
  fi
  sleep 1
done

echo "wait-rest: PostgREST did not serve this reset's identity within 60 checks: ${actual:-none}" >&2
exit 1
