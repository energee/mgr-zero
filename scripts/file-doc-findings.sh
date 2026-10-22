#!/usr/bin/env bash
# scripts/file-doc-findings.sh — files the doc agents' "overlooked documentation"
# findings as GitHub issues. Used by documentation-agent.yml and dreaming.yml;
# the model runs never get issue-write access themselves.
#
# Usage: file-doc-findings.sh <findings.jsonl> <agent name>
# Each line is {"title": "...", "body": "..."}. The lines are model output, so a
# malformed file fails the run (the watchdog then opens an issue), a title already
# open is skipped, and at most five issues are filed per run.
set -euo pipefail
file=$1 agent=$2
[ -s "$file" ] || { echo "No documentation findings."; exit 0; }
jq -e -s 'length > 0 and all(.[]; (.title | type == "string" and length > 0) and (.body | type == "string"))' "$file" >/dev/null \
  || { echo "Malformed findings file: every line must be {\"title\": string, \"body\": string}."; exit 1; }

filed=0
while IFS= read -r line; do
  title="Docs gap: $(jq -r '.title | gsub("\\s+"; " ") | .[:120]' <<<"$line")"
  # An assignment, so a failed search stops the run instead of filing a duplicate.
  open=$(gh issue list --state open --search "in:title \"$title\"" --json title --jq '.[].title')
  if grep -qxF "$title" <<<"$open"; then
    echo "Already open: $title"; continue
  fi
  if [ "$filed" -ge 5 ]; then echo "Five issues filed this run; skipping: $title"; continue; fi
  body="$(jq -r .body <<<"$line")

Filed by the $agent."
  gh issue create --title "$title" --label documentation --body "$body"
  filed=$((filed + 1))
done < <(jq -c . "$file")
