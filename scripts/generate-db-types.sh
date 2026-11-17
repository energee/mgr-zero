#!/usr/bin/env bash
# Run against the disposable test database after applying this checkout's migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
output=$(mktemp)
trap 'rm -f "$output"' EXIT
# The CLI tries TLS on a database URL by default; the local test Postgres has none, hence sslmode=disable.
# --remote=<url> is CLI 3's form of the deprecated --db-url.
bunx supabase gen types --remote="${1:-postgresql://postgres:postgres@127.0.0.1:54352/postgres?sslmode=disable}" --schema public > "$output"
# The local reset's service-only readiness RPC is not application schema.
node scripts/test-db-schema.mjs clean-types "$output"
# Never overwrite the checked-in schema with an empty or failed CLI response.
grep -q '^export type Database = ' "$output"
# The CLI emits an extra blank line at EOF; keep the checked-in file clean.
sed '${/^$/d;}' "$output" > lib/supabase/database.generated.ts
