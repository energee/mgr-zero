#!/usr/bin/env bash
# scripts/dev.sh — `bun run dev` with a port fixed per checkout, so parallel
# worktrees never fight over 3000. The main checkout keeps 3000; a worktree
# under .agents/worktrees/<name> gets 3200 + cksum(<name>) % 800, the same
# number every run. An explicit PORT wins. 3100 stays free for test:e2e.
# ponytail: hash, no registry; on a rare clash Next still moves to the next free port and prints it.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
case "$root" in
  */.agents/worktrees/*) port=$(( 3200 + $(basename "$root" | cksum | cut -d' ' -f1) % 800 )) ;;
  *) port=3000 ;;
esac
export PORT=${PORT:-$port}
exec next dev "$@"
