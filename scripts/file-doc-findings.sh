#!/usr/bin/env bash
# scripts/file-doc-findings.sh — keeps one open "Docs gaps: <agent>" issue per doc
# agent, listing what its latest run found but may not fix. Used by
# documentation-agent.yml and dreaming.yml; the model runs never get issue-write
# access themselves.
#
# Usage: file-doc-findings.sh <findings.jsonl> <agent name>
# Each line is {"title": "...", "body": "..."}. The lines are model output, so:
# - the issue title is fixed: model text never reaches a title, where dreaming's
#   watchdog collector looks, and a rerun edits the open issue instead of filing more;
# - a malformed file fails the run (the watchdog then opens an issue);
# - at most 20 findings are listed, and @-mentions are defused.
set -euo pipefail
file=$1 agent=$2
title="Docs gaps: $agent"

jq -e -s 'all(.[]; (.title | type == "string" and length > 0) and (.body | type == "string"))' "$file" >/dev/null \
  || { echo "Malformed findings file: every line must be {\"title\": string, \"body\": string}."; exit 1; }
[ "$(jq -s length "$file")" -gt 0 ] || { echo "No documentation findings."; exit 0; }

# A zero-width space after each @ stops GitHub notifying whoever the text names.
body=$(jq -rs --arg agent "$agent" '
  "Gaps the \($agent) found but may not fix, from its latest run. Each run replaces this list; close the issue once they are handled.\n\n"
  + (.[:20] | map("### \(.title)\n\n\(.body)") | join("\n\n"))
  | gsub("@"; "@​")' "$file")

open=$(gh issue list --state open --search "in:title \"$title\"" --json number,title --jq "map(select(.title == \"$title\"))[0].number // empty")
if [ -n "$open" ]; then
  gh issue edit "$open" --body "$body"
else
  gh issue create --title "$title" --label documentation --body "$body"
fi
