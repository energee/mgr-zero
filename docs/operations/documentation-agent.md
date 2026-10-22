# Documentation agent

How the post-merge documentation agent audits and updates the staff and portal field manuals.

After a pull request merges, weekly, or when manually dispatched on `main`,
`.github/workflows/documentation-agent.yml` audits every current user-facing
route, not only the triggering change, and updates the
staff and portal field manuals linked from `content/docs/index.mdx` when behavior has drifted. The
Claude job has read-only GitHub permissions and may edit those three MDX files, plus the
Markdown described below. A separate deterministic job rejects wider or active-content changes, then maintains one
reviewable `documentation/user-guide` pull request; the bot never commits directly
to `main`. The validated guide changes travel as a binary patch, applied
three-way to fresh `main` with full history. Unrelated intervening guide updates
are preserved; conflicting edits fail publication before any commit or push.
An empty audit or an already-applied correction produces no commit and leaves
any existing maintenance PR unchanged. The App-token push still runs CI on the documentation PR, and human review remains required.

Markdown files the merged PR added (on a weekly or manual audit, those added in
the last eight days) are integrated too, except plans (`docs/plans/`, which
describe unshipped work) and files other agents own (`.agents/`,
`content/docs/api/`): customer-visible behavior is folded
into the guides, and a new `docs/` page is linked from `README.md` and
deduplicated against existing `docs/` pages. For that the agent may also edit
`README.md` and the `docs/` pages the change added, never an existing runbook.
The validate step enforces this from a list written before the model ran, so
injected PR text cannot rewrite one. It
never moves or deletes a file or touches `.agents/`. Dreaming integrates agent
docs daily by linking new and unlinked specs, plans, and runbooks from
`AGENTS.md` and `.agents/ARCHITECTURE.md`; specs and plans stay read-only. The docs PR body lists any non-guide file it edits.

Whatever either agent finds but may not fix (an unplaceable document, two
documents that contradict each other, an unlinked page in the other agent's
area) is written to a findings file. A separate `report` job, the only one with
issue write access, runs `scripts/file-doc-findings.sh`. It keeps one open
`Docs gaps: <agent>` issue per agent, labelled `documentation`, and replaces its
list on each run. The title is fixed, so model text never reaches an issue
title (dreaming's watchdog collector reads titles). At most 20 findings are
listed, and `@`-mentions are defused. A run that fails validation still reports
its findings. Close the issue once its gaps are handled; the next finding opens
a fresh one.
