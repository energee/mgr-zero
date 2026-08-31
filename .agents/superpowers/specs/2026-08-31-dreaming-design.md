# Dreaming — CI-maintained agent artifacts

Date: 2026-08-31
Status: shipped 2026-08-31; live run pending
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
| Trigger | Every push to `main`, a daily schedule, plus `workflow_dispatch` |
| Loop guard | `paths-ignore` on the doc paths + a `dreaming` concurrency group — exact values live in `.github/workflows/dreaming.yml`, which is authoritative and self-documents the cancel-in-progress rationale |
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
3. `.gitignore` change — un-ignore `.remember/today-*.md` digests so dated
   session summaries ride along with normal commits and become dream input
   (rolling scratch like `now.md` stays local).

## Dream prompt contract

The contract lives in `.agents/agents/dreaming.md` — the executable copy the
workflow runs — and is not restated here; edit dream behavior there via
normal review. Two rationale points that belong to the design, not the
contract:

- Transcript signal doesn't exist in CI, so the inputs are repo-visible
  substitutes: the git/PR window since the last dream plus committed
  `.remember/today-*.md` digests.
- The editable set includes `dreaming.md` itself, so a dream may propose
  changes to its own contract; this is deliberate and contained by human
  review of the dream PR.

## Testing

Trigger once via `workflow_dispatch`; verify the dream PR (a) edits only
editable files, (b) cites evidence for each change, (c) correctly catches the
known current drift (PROGRESS.md predates PRs #7/#8). Normal CI runs on the
dream PR as the merge gate.

Known limitation: the dream pushes with `github.token`, and GitHub suppresses
workflow triggers for such pushes — the dream PR gets no CI run and there is
no branch protection; the human review of the dream PR is the entire merge
gate. Workaround: close/reopen the dream PR to trigger CI, or switch the push
to a PAT later.

## Out of scope (add if needed)

- Deterministic lint pass for mechanical drift (dead refs, broken links).
- Local `/dream` skill packaging.
- Editing specs/wireframes.
