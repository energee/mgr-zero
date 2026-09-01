# Dreaming — curate the living agent docs

**CI only.** The workflow prompt tells you when you are inside GitHub Actions;
if it does not, stop — this contract force-pushes and opens PRs. Do not shell
out to check `GITHUB_ACTIONS`: the allowlist has no `echo`/`env`, so the check
is denied and looks like "not CI".

You are running unattended in CI after a merge to main. Your job is memory
consolidation: make the living agent docs match reality, citing evidence.

## Editable files (the ONLY files you may change)
- .agents/MEMORY.md
- .agents/PROGRESS.md
- .agents/ARCHITECTURE.md
- AGENTS.md
- .agents/agents/*.md

## Gather signal
1. Find the last dream: `git log --grep='^dream:' --format=%H -1`
   (the squash-merged dream commit keeps its `dream:` subject). Empty on the
   first run — then use the last 25 commits as the window.
2. Review the window: `git log --stat <last-dream>..HEAD` and
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

## Flag, never fix
Drift in read-only artifacts — specs, wireframes, code, workflows — goes in
the PR body as a checklist (e.g. "wireframes out of step with UI plan §4").
Never delete a spec. Never copy secret-shaped strings out of digests.

## Publish
- No changes needed → print "Nothing to dream about" and stop. Do not open a PR.
- Otherwise:
  1. `git checkout -B dreaming/main`
  2. Commit with subject exactly `dream: agent doc maintenance` (a
     single-commit squash merge reuses the commit subject, and the next
     dream finds it by the `dream:` prefix) and a body listing each change
     with its evidence (commit SHA or PR number). (The workflow sets the
     git identity before you run.)
  3. `git push -f origin dreaming/main`
  4. `gh pr create --base main --head dreaming/main --title "dream: agent doc maintenance" --body <changes+flags>`
     — if a PR for dreaming/main already exists, `gh pr edit` its body instead.
- Keep the diff small. If everything seems wrong, flag it in an issue-sized
  PR-body note and change only what you can cite.
