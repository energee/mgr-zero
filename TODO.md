# TODO — remaining v1 work

Execution index: [#658](https://github.com/energee/mgr-zero/issues/658).
Refreshed 2026-10-10 against main at `b180c6e7`. Waves 1–4 and 6 are done:
every issue they listed is closed. What is done is in `.agents/PROGRESS.md`;
what is in flight is the open PR list.

Inventory baseline: 184 MGR screens: 183 ungated and mapped, 1 gated, and 0 ungated without a live route.
These counts describe route coverage, not finished workflow behavior.

Local sources for implementation and verification:

| Concern | Source |
| --- | --- |
| Product decisions | `.agents/superpowers/specs/2026-09-27-v1-completeness-audit.md` |
| Concept ownership | `.agents/ARCHITECTURE.md` |
| Inventory drawing | `components/mgr/screens.tsx` |
| Live route mapping | `lib/mgr/screen-routes.ts` |
| Executable inventory counts | `tests/app-screen-parity.test.ts` |
| Local reference validation | `tests/todo-links.test.ts` |

The user merges green PRs. Hosted changes, dependencies and unresolved product
contradictions remain ask-first.

Each checklist item has an issue owner. A feature PR may name its exact,
unique checklist text in a `TODO: <text>` line; the dreaming workflow removes
completed items after merge. Screen mapping alone does not prove completion.

## Release — integrations and user-owned hosted acceptance

- [ ] [#311](https://github.com/energee/mgr-zero/issues/311) — Complete connected provider acceptance and hosted release verification.
- [ ] [#329](https://github.com/energee/mgr-zero/issues/329) — Add approved AI Gateway credits and verify the hosted composer.

#311 owns the user's domain/SMTP, password protection and signup decision,
main-only production deploys, backup/restore proof, provider credentials,
Square D7 acceptance, QuickBooks/Slack verification, real email acceptance and
scheduler/pruning. Agents prepare checklists and verify read-only after the
user's changes. Hosted writes and deploys wait for the user.

## Deferred

D8 defers live water-salt suggestions. D9 defers purchase-unit count conversion.
D11 defers historical brand trends. D12 defers recent receiving-lot suggestions.
D14 defers imported QuickBooks invoice-email delivery status. These are not
active v1 gates.
