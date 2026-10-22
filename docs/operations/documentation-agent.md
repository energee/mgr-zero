# Documentation agent

How the post-merge documentation agent audits and updates the staff and portal field manuals.

After a pull request merges, weekly, or when manually dispatched on `main`,
`.github/workflows/documentation-agent.yml` audits every current user-facing
route, not only the triggering change, and updates the
staff and portal field manuals linked from `content/docs/index.mdx` when behavior has drifted. The
Claude job has read-only GitHub permissions and may edit only those three MDX files. A separate
deterministic job rejects wider or active-content changes, then maintains one
reviewable `documentation/user-guide` pull request; the bot never commits directly
to `main`. The validated guide changes travel as a binary patch, applied
three-way to fresh `main` with full history. Unrelated intervening guide updates
are preserved; conflicting edits fail publication before any commit or push.
An empty audit or an already-applied correction produces no commit and leaves
any existing maintenance PR unchanged. The App-token push still runs CI on the documentation PR, and human review remains required.

Markdown files the merged PR added (on a weekly or manual audit, those added in
the last eight days) are integrated too: customer-visible behavior is folded
into the guides, and a new `docs/` page is linked from `README.md` and
deduplicated against existing `docs/` pages. For that the agent may also edit
`docs/**/*.md` and `README.md`, never move or delete a file, and never touch
`.agents/` (dreaming integrates agent docs the same way, daily).

Whatever either agent finds but may not fix (an unplaceable document, two
documents that contradict each other, an unlinked page in the other agent's
area) is written to a findings file. A separate `report` job, the only one with
issue write access, files each finding with `scripts/file-doc-findings.sh` as a
`Docs gap: …` issue labelled `documentation`: at most five a run, skipping
titles already open.
