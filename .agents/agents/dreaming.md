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
   `gh pr list --state merged --search 'merged:>=<last-dream date>' --limit 500
   --json number,title,mergedAt`. `gh pr list` defaults to 30 results and
   silently truncates past whatever `--limit` you pass with no error — a
   window with more merged PRs than your `--limit` loses the oldest ones.
   Confirm the true count first with `--json number --jq 'length'` at a high
   `--limit` (500 covers this repo's largest window so far) before trusting
   the list. `gh api --paginate` and `gh issue *` may be blocked in this
   sandbox; `gh pr list` / `gh pr view` are the reliable primitives — use
   `gh pr view <n>` only for PRs you need evidence from.
3. Search merged PR bodies for a `## Durable decisions (for the dreaming log)`
   heading (or similar) first — feature PRs that make a real design ruling
   often write one, and it is a stronger, cheaper signal than reading every
   diff. `gh pr view <n> --json body --jq .body` on the PRs the title suggests
   are substantial (a Program/design/audit PR, not a routine `docs:` refresh
   or single-issue `fix:`) is the practical way to find them while `gh api`
   search is blocked.
4. Read any committed .remember/today-*.md session digests (there may be
   none; the remember plugin retires them locally once a day rolls over).
5. Read every editable file end to end.

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
- `PROGRESS.md` has no Now section: add dated Done lines only.
  `scripts/pr-directives.ts` has already moved finished `TODO.md` items
  there before you run.
- Feature PRs do not edit the logs themselves (AGENTS.md step 6); the PR
  description carries the progress note and any durable decision. Treat that
  text as the primary input for `PROGRESS.md` and `MEMORY.md`.

## Flag, never fix
Drift in read-only artifacts — specs, wireframes, code, workflows — is durable
work, not PR-body prose. Add, update, or remove a concise unchecked item in
`.agents/DRIFT.md`, citing the evidence and owning artifact. Never delete a
spec. Never copy secret-shaped strings out of digests.

Keep the diff small. If no editable file needs changing, print "Nothing to
dream about" and stop; the workflow handles the no-op and publication paths.
