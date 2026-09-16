#!/usr/bin/env bash
# Run against the disposable test database after applying this checkout's migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
output=$(mktemp)
trap 'rm -f "$output"' EXIT
bunx supabase gen types --db-url "${1:-postgresql://postgres:postgres@127.0.0.1:54352/postgres}" --schema public > "$output"
# Never overwrite the checked-in schema with an empty or failed CLI response.
rg -q '^export type Database = ' "$output"
# The CLI emits an extra blank line at EOF; keep the checked-in file clean.
sed '${/^$/d;}' "$output" > lib/supabase/database.generated.ts
