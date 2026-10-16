#!/usr/bin/env bash
# scripts/claude-guard.sh — Claude Code PreToolUse hook (registered for Bash in
# .claude/settings.json). It reads the hook JSON on stdin and, only for a
# command that runs `git commit` or `git push` (including `git -C <dir> ...`),
# blocks (exit 2, reason on stderr) two failures that have each reached a PR:
#   1. A commit/push chained to a test, lint, or tsc run in one command. A
#      `| tail` or `| grep` on the check hid a red result and the commit or
#      push went ahead anyway; checks must be separate steps gated on their
#      own exit codes.
#   2. A commit/push while supabase/migrations.lock.json is not valid JSON. A
#      merge outside scripts/land-pr.sh silently corrupted the lock and the
#      broken file was committed.
# Every other command exits 0 untouched.
set -euo pipefail

input=$(cat)
command=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
cwd=${cwd:-.}

# The command with heredoc bodies and quoted strings removed, so a commit
# message that mentions vitest, tsc, or `bun run test` is not read as a run.
code=$(perl -0777 -pe '
  s/<<-?\s*([\x27"]?)(\w+)\1([^\n]*)\n.*?\n\s*\2[ \t]*(?=\n|\z)/$3/gs;
  s/\x27[^\x27]*\x27/\x27\x27/g;
  s/"(?:\\.|[^"\\])*"/""/g;
' <<<"$command")

# `git`, then any `-C <dir>` / `-c <key=value>` options, then commit or push.
grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+-[Cc][[:space:]]+[^[:space:]]+)*[[:space:]]+(commit|push)([^[:alnum:]_-]|$)' <<<"$code" || exit 0

if grep -Eq '(^|[^[:alnum:]_.-])(vitest|tsc)([^[:alnum:]_.-]|$)|bun[[:space:]]+run[[:space:]]+(test|lint)' <<<"$code"; then
  echo "claude-guard: run tests/lint/tsc as a separate command, read its exit code, then commit or push." >&2
  exit 2
fi

# The tree the command acts on: a `git -C <dir>` wins, then a `cd <dir>`,
# then the hook's cwd. A relative dir resolves against the hook's cwd.
target=$(perl -ne '
  if (/\bgit\s+-C\s+("[^"]*"|\x27[^\x27]*\x27|\S+)/) { $d = $1 }
  elsif (/(?:^|[;&|]\s*)cd\s+("[^"]*"|\x27[^\x27]*\x27|[^\s;&|]+)/) { $d = $1 }
  if (defined $d) { $d =~ s/^["\x27]|["\x27]$//g; print $d; exit }
' <<<"$command")
case "$target" in
  "") target=$cwd ;;
  /*) ;;
  *) target="$cwd/$target" ;;
esac

root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || echo "$target")
lock="$root/supabase/migrations.lock.json"
if [[ -f "$lock" ]] && ! jq empty "$lock" 2>/dev/null; then
  echo "claude-guard: $lock is not valid JSON; regenerate it with bun run migrations:lock first." >&2
  exit 2
fi
exit 0
