#!/usr/bin/env bash
# scripts/worktree.sh — create a worktree that can actually run: branch under
# .agents/worktrees/, env files symlinked to the main checkout (gitignored, so
# they never come with the checkout), deps installed (Turbopack rejects a
# node_modules symlink, so each worktree owns its own).
#
#   scripts/worktree.sh <branch> [base]
set -euo pipefail

branch=${1:?usage: scripts/worktree.sh <branch> [base]}
base=${2:-HEAD}
root=$(git rev-parse --show-toplevel)
dir="$root/.agents/worktrees/${branch//\//-}"

git -C "$root" worktree add "$dir" -b "$branch" "$base"
for f in .env.local .env.test.local; do
  [ -e "$root/$f" ] && ln -sfn "$root/$f" "$dir/$f"
done
(cd "$dir" && bun install --frozen-lockfile)

echo "ready: $dir ($branch)"
