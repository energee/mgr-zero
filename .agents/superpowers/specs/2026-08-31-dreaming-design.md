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
| Write path | One long-lived PR from branch `dreaming/main` — while that PR is open each dream *appends* a commit, so unreviewed dreams and reviewer corrections survive; only a fresh branch (no open PR) is force-pushed. Never direct commits to main |
| Editable | The living agent docs — the authoritative list lives in `.agents/agents/dreaming.md` (mirrored by the workflow's `paths-ignore`) |
| Read-only (flag drift only) | Everything else — specs, wireframes, code, workflows (see `dreaming.md`) |
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
editable files, (b) cites evidence for each change, (c) is authored by
`mgr[bot]` with the MGR GitHub App icon. `ci` runs on the dream PR as the
merge gate (the MGR app token is not `github.token`, so GitHub does trigger
workflows on the push). Claude Code Review is skipped on `dreaming/main`
(job skipped, not failed): the action rejects non-human PR authors, and a
review of the doc-curation PR is not useful.

## MGR GitHub App identity

Dream commits and PRs are the MGR GitHub App (`mgr[bot]`), not
`claude[bot]` and not `github-actions[bot]`. The workflow mints an
installation token (`actions/create-github-app-token@v2`) and passes it as
`github_token` to `anthropics/claude-code-action` — without that input the
action exchanges OIDC for Claude's app and every dream PR is authored by
`claude[bot]`.

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
