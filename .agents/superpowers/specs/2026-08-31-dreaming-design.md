# Dreaming — CI-maintained agent artifacts

Date: 2026-08-31
Status: approved design, pre-implementation
Branch: agent-prompting

## What and why

Adapt Anthropic's "dreaming" concept (Managed Agents memory consolidation,
announced May 2026) to this repo: a post-merge CI job that reviews recent
work and curates the living agent documents — pruning stale facts, merging
duplicates, resolving contradictions, and recording durable decisions — so
every future session starts from accurate context.

Anthropic's dreaming reviews session transcripts between runs and updates
plain-text playbooks, never model weights. The auditable-plain-text principle
carries over; the transcript signal does not exist in CI, so this design
substitutes repo-visible signals (see Signal).

## Decisions

| Decision | Choice |
| --- | --- |
| Trigger | Every push to `main`, plus `workflow_dispatch` |
| Loop guard | `paths-ignore: ['.agents/**.md', '.remember/**']` + `concurrency: dreaming, cancel-in-progress: true` |
| Write path | One long-lived PR from branch `dreaming/main` (force-pushed each dream); never direct commits to main |
| Editable | `.agents/MEMORY.md`, `.agents/PROGRESS.md`, `.agents/ARCHITECTURE.md`, `AGENTS.md`, `.agents/agents/*.md` |
| Read-only (flag drift only) | specs, wireframes, code, workflows |
| Signal | Git history + merged PR diffs/comments since last dream, plus committed `.remember/` digests |

## Components

1. `.github/workflows/dreaming.yml` — reuses `anthropics/claude-code-action@v1`
   with the existing `CLAUDE_CODE_OAUTH_TOKEN`. Needs `contents: write` and
   `pull-requests: write` (unlike the read-only review workflows).
2. `.agents/agents/dreaming.md` — the committed dream prompt (the contract
   below). The workflow passes it as the prompt; changing dream behavior is a
   normal reviewed edit to this file.
3. `.gitignore` change — un-ignore `.remember/*.md` digests so session
   summaries ride along with normal commits and become dream input.

## Dream prompt contract

Inputs each run:
- Commits and merged PR diffs/review comments since the previous dream
  (previous dream = last commit touching only editable files by the dream PR,
  or full history on first run).
- `.remember/` digests.
- The editable artifacts themselves, checked for internal consistency.

Allowed actions on editable files:
- Prune facts contradicted by merged work; convert relative dates to absolute.
- Merge duplicate or overlapping entries.
- Resolve contradictions, citing the winning evidence.
- Record durable decisions evidenced by merged PRs.

Required behavior:
- Every change cited to a commit/PR in the PR body.
- Drift in read-only artifacts (e.g. wireframes out of step with the UI plan,
  ARCHITECTURE.md referencing moved files) is flagged in the PR body, not fixed.
- Never delete a spec. Never propagate secret-shaped strings from digests.
- Nothing to change → no PR, exit clean.
- Keep diffs small; a dream that wants to rewrite everything should instead
  flag the need and stop.

## Testing

Trigger once via `workflow_dispatch`; verify the dream PR (a) edits only
editable files, (b) cites evidence for each change, (c) correctly catches the
known current drift (PROGRESS.md predates PRs #7/#8). Normal CI runs on the
dream PR as the merge gate.

## Out of scope (add if needed)

- Deterministic lint pass for mechanical drift (dead refs, broken links).
- Local `/dream` skill packaging.
- Editing specs/wireframes.
