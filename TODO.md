# TODO — remaining v1 work

Execution index: [#658](https://github.com/energee/mgr-zero/issues/658).
It owns wave order, dependencies, migration reservations, checkpoints and the
status ledger. Refreshed 2026-09-27 against main at `11156878`.

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

The user merges green PRs. Schema changes are authorized with local proof;
required specifications still get independent review. Hosted changes,
dependencies and unresolved product contradictions remain ask-first.

Each checklist item has an issue owner. A feature PR may name its exact,
unique checklist text in a `TODO: <text>` line; the dreaming workflow removes
completed items after merge. Screen mapping alone does not prove completion.

## Wave 1 — pilot correctness and onboarding

- [ ] [#615](https://github.com/energee/mgr-zero/issues/615) — Preserve consequential command identity across edits, retries and reloads.
- [ ] [#621](https://github.com/energee/mgr-zero/issues/621) — Page staff and portal order and invoice histories.
- [ ] [#641](https://github.com/energee/mgr-zero/issues/641) — Move failed QuickBooks refreshes into recovery_required.
- [ ] [#619](https://github.com/energee/mgr-zero/issues/619) — Cancel and reschedule unstarted batches and packaging runs.
- [ ] [#625](https://github.com/energee/mgr-zero/issues/625) — Deliver durable buyer order-confirmation email.
- [ ] [#580](https://github.com/energee/mgr-zero/issues/580) — Accept existing-account invitations with explicit consent.
- [ ] [#646](https://github.com/energee/mgr-zero/issues/646) — Show manual QuickBooks sync operator, last success and errors.

Buyer email and existing-account invitations are pilot requirements. Build and
test locally; actual delivery awaits user-owned sending-domain/SMTP setup.
Pause after the user merges the wave and report the pilot-path status.

## Waves 2a–2b — reviewed production specs and implementation

- [ ] [#618](https://github.com/energee/mgr-zero/issues/618) — Record failed or partially accepted delivery and physical returns.
- [ ] [#622](https://github.com/energee/mgr-zero/issues/622) — Record actual brew-day ingredients and a frozen process sheet with corrections.
- [ ] [#623](https://github.com/energee/mgr-zero/issues/623) — Record packaging actual usage, unused returns and loss with authoritative planning data.
- [ ] [#647](https://github.com/energee/mgr-zero/issues/647) — Correct purchase receipts and PO balances while preserving stock history.

#622, #623 and #647 each need a reviewed specification and v1 cross-check.
Implement them in that order so later corrections reuse the reviewed pattern.
#618 has a merged spec and may proceed alongside the specification work.
There is no separate user schema-approval pause. Pause after Wave 2b merges.

Schedule packaging's shared drawing is already merged in #610. Remaining
planned-material/shortfall data belongs to #623; route presence is not proof
that every inventory fact is available live.

## Wave 3 — reporting

- [ ] [#626](https://github.com/energee/mgr-zero/issues/626) — Reconcile destination-state totals and transaction export with returns and corrections.

Depends on the retained return/correction facts from Wave 2. State tax forms
remain external; current tank values must stay labeled current.

## Wave 4 — required screen work

- [ ] [#648](https://github.com/energee/mgr-zero/issues/648) — Preview exact material-count lot adjustments before confirmation.
- [ ] [#649](https://github.com/energee/mgr-zero/issues/649) — Show Batches readings and a direct recording action.
- [ ] [#650](https://github.com/energee/mgr-zero/issues/650) — Link invoices to verified QuickBooks destinations.
- [ ] [#651](https://github.com/energee/mgr-zero/issues/651) — Count and review customers missing email addresses.
- [ ] [#652](https://github.com/energee/mgr-zero/issues/652) — Link Settings to the existing Water profiles screen.
- [ ] [#653](https://github.com/energee/mgr-zero/issues/653) — Use role-appropriate Open and Pick actions on Orders.
- [ ] [#654](https://github.com/energee/mgr-zero/issues/654) — Show recoverable portal-payment and Square OAuth failures.
- [ ] [#655](https://github.com/energee/mgr-zero/issues/655) — Close the named Settings, customer and Units surface-parity gaps.

Use shared inventory/live views and E controls. Pause after the user merges
this wave and report source-based parity plus rendered proof.

## Wave 5 and release — integrations and user-owned hosted acceptance

- [ ] [#640](https://github.com/energee/mgr-zero/issues/640) — Resolve Square remote-revocation recovery with provider evidence.
- [ ] [#311](https://github.com/energee/mgr-zero/issues/311) — Complete connected provider acceptance and hosted release verification.
- [ ] [#329](https://github.com/energee/mgr-zero/issues/329) — Add approved AI Gateway credits and verify the hosted composer.

#625 and #580 implementation moved to Wave 1; real email acceptance remains
here. The sending domain is required for the pilot, not parked indefinitely.
#311 owns the user's domain/SMTP, password protection and signup decision,
main-only production deploys, backup/restore proof, provider credentials,
Square D7 acceptance, QuickBooks/Slack verification and scheduler/pruning.
Agents prepare checklists and verify read-only after the user's changes.
Hosted writes and deploys wait for the user.

## Wave 6 — documentation reconciliation

- [ ] [#656](https://github.com/energee/mgr-zero/issues/656) — Reconcile guides, README and deferred v1 claims with shipped behavior.

Each feature PR updates its guides too. The final pass checks cross-feature
claims and reports local proof separately from real provider acceptance.

## Outside the release waves

- [ ] [#657](https://github.com/energee/mgr-zero/issues/657) — Reassess optional screen and query cleanup after v1 prioritization.

D8 defers live water-salt suggestions. D9 defers purchase-unit count conversion.
D11 defers historical brand trends. D12 defers recent receiving-lot suggestions.
D14 defers imported QuickBooks invoice-email delivery status. These are not
active v1 gates; #656 owns removal of remaining stale promises and gate text.
