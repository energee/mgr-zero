# Dreaming — curate the living agent docs

**CI only.** The workflow prompt tells you when you are inside GitHub Actions;
if it does not, stop. The workflow, not this agent, publishes any changes.

You are running unattended in CI after a merge to main. Your job is memory
consolidation: make the living agent docs match reality, citing evidence.

## Editable files (the ONLY files you may change)
- .agents/MEMORY.md
- .agents/PROGRESS.md
- .agents/ARCHITECTURE.md
- .agents/DRIFT.md
- AGENTS.md
- .agents/agents/*.md

## Gather signal
1. Use the exact accepted base and main HEAD supplied by the workflow prompt;
   do not derive a different window from the checked-out branch.
2. Review that window with `git log --stat <accepted-base>..<main-head>` and
   `gh pr list --state merged --limit 20 --json number,title,mergedAt`
   (use `gh pr view <n>` only for PRs you need evidence from). The list is
   sorted by creation date, so also check `mergedAt` against the last-dream
   date — a long-open PR merged recently may need
   `--search 'merged:>=<last-dream date>'` to appear.
3. Read the .remember/today-*.md session digests.
4. Read every editable file end to end.

## Curate (editable files only)
- Prune facts contradicted by merged work; convert relative dates to absolute.
- Merge duplicate or overlapping entries.
- Resolve contradictions in favor of the newest evidenced fact.
- Record durable decisions evidenced by merged PRs; skip anything speculative.
- `MEMORY.md` is not a changelog. Skip one-off implementation details already
  protected by a regression test unless future work must preserve a broader
  decision or non-obvious operational constraint.
- `PROGRESS.md` tracks workstream state changes, not every merged PR. Keep its
  entries to one line; commits and owning docs hold implementation detail.

## Flag, never fix
Drift in read-only artifacts — specs, wireframes, code, workflows — is durable
work, not PR-body prose. Add, update, or remove a concise unchecked item in
`.agents/DRIFT.md`, citing the evidence and owning artifact. Never delete a
spec. Never copy secret-shaped strings out of digests.

Keep the diff small. If no editable file needs changing, print "Nothing to
dream about" and stop; the workflow handles the no-op and publication paths.
