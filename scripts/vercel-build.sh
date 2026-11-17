#!/usr/bin/env bash
set -euo pipefail

if [[ ${VERCEL_ENV:-} == production ]]; then
  : "${POSTGRES_URL_NON_POOLING:?Missing production database URL}"
  bunx supabase db push --remote="$POSTGRES_URL_NON_POOLING" --yes
fi

bun run build
