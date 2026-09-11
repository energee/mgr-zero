#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

changed=$(git diff --name-only origin/main...HEAD)
if ! grep -Eq '^(app/|components/|lib/|scripts/|supabase/|tests/|package\.json|bun\.lock|tsconfig\.json|next\.config\.ts|eslint\.config\.mjs)' <<< "$changed"; then
  echo "pre-push: no code changes"
  exit 0
fi

bun run lint
bunx tsc --noEmit
bun run build
bunx vitest run --fileParallelism --maxWorkers=2 \
  tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts \
  tests/theme-contrast.test.ts tests/screen-persona.test.ts \
  tests/design-docs.test.ts tests/docs.test.ts
bash scripts/test-db.sh
for shard in 1/3 2/3 3/3; do
  if [[ "$shard" != "1/3" ]]; then bunx supabase db reset --workdir tests/supabase; fi
  bunx vitest run --shard="$shard" \
    --exclude tests/mgr-screens.test.ts --exclude tests/tap-coverage.test.ts \
    --exclude tests/screen-links.test.ts --exclude tests/theme-contrast.test.ts \
    --exclude tests/screen-persona.test.ts --exclude tests/design-docs.test.ts \
    --exclude tests/docs.test.ts
done
