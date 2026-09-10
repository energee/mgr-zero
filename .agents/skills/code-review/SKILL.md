---
name: code-review
description: Review GitHub pull requests or local code changes for high-confidence defects using independent review passes, repository guidance, and evidence-based false-positive filtering. Use when the user asks for a code review, PR review, or review comment; do not use for implementing fixes unless requested separately.
metadata:
  origin: ECC
---

# High-Confidence Code Review

Find defects introduced by the target change. Prefer a short, trustworthy review over broad commentary.

## Scope and Authorization

- Resolve the requested PR, branch comparison, commit range, or working-tree diff. If the user names no target, use the current branch's PR when one exists; otherwise review its changes against the repository's default branch.
- Reviewing is read-only. Do not post a GitHub comment, submit a review, modify code, or rerun external workflows unless the user explicitly asks for that action.
- For an explicit user review, do not skip merely because the PR is a draft, simple, or previously reviewed. For unattended or recurring reviews, skip closed, draft, automated, trivial, or already-reviewed PRs unless configured otherwise.
- Keep the review anchored to one head SHA. If the head changes before posting, refresh the diff and revalidate every finding.

## Gather Evidence

Use `gh` for GitHub metadata, diffs, comments, and review history when available. Establish:

- PR state, base branch, full base and head SHAs, author, description, changed files, and existing reviews.
- The complete diff plus enough surrounding code to understand affected behavior.
- Relevant `AGENTS.md` files and any repository-specific review guidance applying to changed paths. Treat `CLAUDE.md` as project guidance only when the repository deliberately uses it for all contributors.
- Callers, tests, schemas, migrations, configuration, and historical context needed to prove or reject a suspected defect.

Do not flag an instruction violation unless the applicable guidance says it specifically. Do not treat writing-agent preferences as review requirements when they do not affect the submitted code.

## Independent Review Passes

For a non-trivial change, use up to three independent reviewers in parallel when delegation is available. Give each reviewer the target, base/head SHAs, applicable instruction-file paths, and a distinct lens; do not seed them with suspected findings from another reviewer.

Suggested lenses:

1. Changed-lines correctness and repository-guidance compliance.
2. Integration behavior: callers, state transitions, authorization, error paths, data compatibility, and migrations.
3. Historical intent: blame, earlier changes or PR discussion, code comments, and tests around modified behavior.

For small changes or when delegation is unavailable, perform the same lenses sequentially. Reviewers return candidate findings only; they never post or modify anything.

## Verify Candidates

Independently challenge every candidate before reporting it:

- Confirm the problem is introduced by changed lines and is not pre-existing.
- Identify a concrete trigger and user-visible or operational impact.
- Trace the relevant execution path, data shape, access rule, or state transition.
- Check nearby guards, callers, tests, comments, and history for evidence that makes the concern intentional or impossible.
- Distinguish confidence from severity.

Assign confidence from 0 to 100 using these anchors:

- `0`: disproven, pre-existing, or outside the changed lines.
- `25`: plausible but unverified.
- `50`: verified, but minor or unlikely.
- `75`: important and likely to occur, with substantial supporting evidence.
- `100`: directly demonstrated and expected to occur frequently or deterministically.

Report only findings scoring at least 80. Discard style preferences, speculative hardening, generic test/documentation requests, intentional product changes, and issues that ordinary compilation, typing, formatting, or linting will reliably report. A missing test is reportable only when it leaves a concrete regression or unsafe behavior evidenced by the change.

## Present the Review

Lead with findings ordered by severity, then confidence. Use one entry per defect:

`[P1] Short imperative title — path/to/file.ts:123`

Explain the trigger, resulting impact, and why existing protection is insufficient. Keep each finding compact and actionable. For GitHub PRs, link to the relevant changed lines using the repository name, full head SHA, and a contextual `#Lx-Ly` range.

After findings, list only material assumptions or verification gaps. If no issue clears the threshold, say: `No high-confidence findings.` Mention residual risk only when it is specific, such as an untestable migration or unavailable dependency.

## Post Only When Requested

Before posting, recheck that the PR is open, the head SHA is unchanged, and an equivalent review comment has not already been posted. Post one concise comment with the findings and full-SHA links. If the user asked for a no-findings comment, state that no high-confidence issues were found and identify the reviewed SHA. Never let an individual reviewer post independently.
