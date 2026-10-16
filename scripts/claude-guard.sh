#!/usr/bin/env bash
# scripts/claude-guard.sh — Claude Code PreToolUse hook (registered for Bash in
# .claude/settings.json). It reads the hook JSON on stdin and, only for a
# command that runs `git commit` or `git push`, blocks (exit 2, reason on
# stderr) two failures that have each reached a PR before:
#   1. A commit/push chained to a test, lint, or tsc run in one command. A
#      `| tail` or `| grep` on the check hid a red result and the commit or
#      push went ahead anyway; checks must be separate steps gated on their
#      own exit codes.
#   2. A commit/push while supabase/migrations.lock.json is not valid JSON. A
#      merge outside scripts/land-pr.sh silently corrupted the lock and the
#      broken file was committed. The lock is checked in the hook's cwd tree.
# Every other command exits 0 untouched.
set -euo pipefail

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")

grep -Eq 'git[[:space:]]+(commit|push)' <<<"$command" || exit 0

if grep -Eq 'vitest|bun run test|bun run lint|tsc' <<<"$command"; then
  echo "claude-guard: run tests/lint/tsc as a separate command, read its exit code, then commit or push." >&2
  exit 2
fi

root=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null || echo "${cwd:-.}")
lock="$root/supabase/migrations.lock.json"
if [[ -f "$lock" ]] && ! jq empty "$lock" 2>/dev/null; then
  echo "claude-guard: $lock is not valid JSON; regenerate it with bun run migrations:lock first." >&2
  exit 2
fi
exit 0
