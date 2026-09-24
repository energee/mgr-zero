#!/usr/bin/env bash
# scripts/pre-push.sh — the fast half of CI, run before a push so obvious
# breakage never leaves the machine: lint, typecheck, and the pure vitest
# files AGENTS.md names as the proof for screen work, plus the migration lock
# (tests/migrations-applied.test.ts). About a minute.
#
# `next build` and the three database shards are deliberately NOT here. CI
# (.github/workflows/ci.yml) runs them on every push, in parallel jobs, against
# a database built from scratch — and it, not this hook, is the merge gate.
# Locally they cost ten minutes, reset a database other worktrees are using,
# and fail on their own infrastructure (stale PostgREST schema cache, container
# clock skew) often enough to train people to ignore the result.
#
# Run the full suite by hand when you want it:
#   bash scripts/test-db.sh && bunx vitest run
set -euo pipefail
cd "$(dirname "$0")/.."

changed=$(git diff --name-only origin/main...HEAD)
if ! grep -Eq '^(app/|components/|lib/|scripts/|supabase/|tests/|package\.json|bun\.lock|tsconfig\.json|next\.config\.ts|eslint\.config\.mjs)' <<< "$changed"; then
  echo "pre-push: no code changes"
  exit 0
fi

bun run lint
bunx tsc --noEmit
bunx vitest run --fileParallelism --maxWorkers=2 \
  tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts \
  tests/theme-contrast.test.ts tests/screen-persona.test.ts \
  tests/design-docs.test.ts tests/docs.test.ts tests/migrations-applied.test.ts
