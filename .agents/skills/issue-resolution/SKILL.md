---
name: issue-resolution
description: Resolve an MGR GitHub issue or pull-request conflict from a numeric reference such as "fix #247". Use for implementation, conflict repair, verification, and delivery; do not use for read-only issue triage or code review.
---

# Issue resolution

Turn a terse issue or PR reference into a verified, isolated change without
guessing which checkout, branch, or artifact the number names.

## Establish the target

Run `.agents/skills/orient/SKILL.md` first and obey its confirmation pause. Do
not work around changes in the current checkout. After confirmation:

1. Try `gh pr view <number>` first, then `gh issue view <number>` if it is not a
   PR. Read the title, body, base/head branches, merge state, and linked context.
2. Every issue gets its own narrowly named branch and worktree under
   `.agents/worktrees/<branch>`, created from freshly fetched `origin/main`
   unless the user chose another base. Never implement an issue in the repository
   root or combine multiple issues in one branch/worktree. For a PR, use its
   existing clean head-branch worktree when present; otherwise create one under
   `.agents/worktrees/<branch>` using the actual remote head.
3. Confirm the selected worktree is clean and on the intended branch before
   editing. Never borrow a dirty checkout merely because it is the repository
   root.

Read `AGENTS.md` and the routed owner documentation before changing code. Use
the issue body as evidence, not as permission to widen scope.

## Choose the resolution path

### Implement an issue

Trace the reported symptom through every caller to the owning implementation.
Search for an existing helper or pattern before adding code. Use the applicable
TDD skill: add the smallest regression that fails for the reported behavior,
observe RED, fix the shared root cause, then observe GREEN. Update customer docs
when the visible behavior changes.

For screen work, also use `.agents/skills/screen-parity/SKILL.md`; it owns the
inventory/live composition contract and exact proof suite. Do not start schema
or database work while screens are the repository focus unless requested.

### Repair a PR conflict

Fetch the PR head and its declared base, then merge the base into the checked-out
head branch. Prefer a merge for an already-pushed or stacked branch; do not
rewrite shared history merely to make it linear.

Resolve each hunk by intent:

- Read the PR body, its commits, the base-side commits, and surrounding code.
- Preserve the feature the PR exists to deliver plus newer compatible base
  changes. Conflict sides are inputs, not answers; do not mechanically choose
  ours, theirs, or both.
- In stacked PRs, expect the parent to appear on `main` as a squash commit while
  the child retains the parent's original commit. Equivalent history can produce
  an empty-content merge plus real textual conflicts.
- Treat debt lists, allowlists, imports, and docs as behavioral contracts. Adding
  both sides can reintroduce debt or duplicate an implementation the child PR
  intentionally replaces.
- Search for conflict markers, stage only resolved files, and run `git diff
  --check` before concluding the merge.

Conflict reconciliation normally reuses the PR's existing regressions. Add a new
test only when the merge reveals behavior not already covered; do not manufacture
a RED test for equivalent-history bookkeeping.

## Prove and deliver

Run the repository-prescribed tests for the affected area, then typecheck and
lint. For UI changes, use `.agents/skills/browse/SKILL.md` against the port
printed by this worktree's dev server, with the branch-derived browser session;
inspect the relevant live route and inventory frame, then close the session and
server.

Before committing, inspect `git status`, `git diff`, and `git diff --check`.
Commit the implementation or conclude the merge, push the PR head branch, and
query GitHub again. Completion requires the pushed revision to report
`mergeable: MERGEABLE`; report CI as pending, failing, or passing exactly as
GitHub reports it. A cleared conflict with pending checks is mergeable, not ready
to merge.

Report the PR or issue link, pushed commit, checks actually run, visual evidence
when applicable, and remaining CI state. Never claim unrun database suites or
pending GitHub checks passed.
