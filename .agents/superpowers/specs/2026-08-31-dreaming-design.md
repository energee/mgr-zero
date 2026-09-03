# Dreaming — CI-maintained agent artifacts

Date: 2026-08-31
Status: shipped 2026-08-31; deterministic publication 2026-09-02
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
| Trigger | Daily schedule plus `workflow_dispatch`; consolidation is batched instead of paid once per merge |
| Loop guard | `refs/dreaming/last-checked` skips quiet scheduled runs; the `dreaming` concurrency group serializes runs |
| Write path | Claude only edits the bounded documents. A separate deterministic job validates, commits, pushes, and creates/updates the `dreaming/main` PR; it refuses to publish or advance the marker if PR state changed during curation |
| Editable | The living agent docs plus `.agents/DRIFT.md`; the authoritative list lives in `.agents/agents/dreaming.md` |
| Read-only (flag drift only) | Everything else — unresolved drift is persisted in `.agents/DRIFT.md` |
| Signal | Git history + merged PR diffs/comments since last dream, plus any committed `.remember/today-*.md` digests (optional; the remember plugin retires them locally, so they are often absent) |

## Components

1. `.github/workflows/dreaming.yml` — reuses `anthropics/claude-code-action@v1`
   with the existing `CLAUDE_CODE_OAUTH_TOKEN`. The model job has read-only
   GitHub permissions; only the deterministic publish job can write.
2. `.agents/agents/dreaming.md` — the committed dream prompt (the contract
   below). The workflow passes it as the prompt; changing dream behavior is a
   normal reviewed edit to this file.
3. `.agents/DRIFT.md` — durable unresolved findings in artifacts the model may
   inspect but not edit.
4. `.gitignore` change — un-ignore `.remember/today-*.md` digests so dated
   session summaries can ride along with normal commits as extra dream input
   (rolling scratch like `now.md` stays local; the plugin renames a digest to
   `.done.md` after rollover, so a committed one shows as deleted locally).

## Dream prompt contract

The contract lives in `.agents/agents/dreaming.md` — the executable copy the
workflow runs — and is not restated here; edit dream behavior there via
normal review. Two rationale points that belong to the design, not the
contract:

- Transcript signal doesn't exist in CI, so the inputs are repo-visible
  substitutes: the git/PR window since the last dream plus any committed
  `.remember/today-*.md` digests.
- The model job validates and commits the dream itself and hands publish a
  `git bundle` of that commit. Publish pushes exactly that tree: it never
  re-merges main (the two jobs could otherwise disagree about whether
  `dreaming/main` still merges) and never needs the preimage blobs a `--3way`
  patch apply would (a merge-product blob exists in no pushed ref). Edits that
  land on main during the run leave the PR one merge behind, which the next
  dream's merge absorbs. A `dreaming/main` that no longer merges cleanly is
  abandoned and rebuilt from main rather than failing every scheduled run; the
  run logs a warning and the PR body says so.
- The publish push is `--force-with-lease` on the `dreaming/main` head the
  model job built on, so a commit a reviewer pushes to the branch mid-run
  rejects the push (the run retries without advancing the marker) instead of
  being overwritten.
- Both Claude workflows read one deny list, `.github/claude-ci-settings.json`.
- The editable set includes `dreaming.md` itself, but the workflow still
  enforces the file boundary and owns publication.

## Testing

Trigger once via `workflow_dispatch`; verify the dream PR (a) edits only
editable files, (b) cites evidence for each change, (c) is authored by
`mgr[bot]` with the MGR GitHub App icon. `ci` runs on the dream PR as the
merge gate (the MGR app token is not `github.token`, so GitHub does trigger
workflows on the push). Claude Code Review is skipped on `dreaming/main`
(job skipped, not failed): the action rejects non-human PR authors, and a
review of the doc-curation PR is not useful.

## MGR GitHub App identity

Dream commits and PRs are the MGR GitHub App (`mgr[bot]`), not `claude[bot]`
and not `github-actions[bot]`. Claude runs with the read-only workflow token
and cannot publish. After its artifact passes the file-boundary check, the
separate publish job mints an installation token with
`actions/create-github-app-token@v2` and performs every git/PR write.

Create the app once (GitHub → Settings → Developer settings → GitHub Apps →
New GitHub App):

1. Name **MGR** (slug `mgr`; PRs then show as `mgr[bot]`). Homepage
   `https://github.com/energee/mgr-zero`. Uncheck webhooks.
2. Repository permissions: **Contents** Read and write, **Pull requests**
   Read and write, **Issues** Read-only, **Metadata** Read-only.
3. Install on this account, only on `mgr-zero`.
4. Upload `docs/brand/mgr-github-app-icon.png` as the app logo (GitHub
   circle-crops it). That PNG is a 1024px raster of the canonical mark in
   `app/icon.svg` / `lib/mgr-icon.ts` — do not draw a second logo.
5. Generate a private key. Then:
   `gh variable set MGR_APP_ID --body '<app id>'`
   `gh secret set MGR_APP_PRIVATE_KEY < /path/to/mgr-private-key.pem`

The next dream run fails closed until those two values exist.

## Out of scope (add if needed)

- Deterministic lint pass for mechanical drift (dead refs, broken links).
- Local `/dream` skill packaging.
- Editing specs/wireframes.
