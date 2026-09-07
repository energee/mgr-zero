# TODO — everything left to match `/docs/screens-explore`

Index written 2026-09-07 against `main` @ `b3f6a91` (Programs 0–4b merged)  This is the checklist; each
program's own plan holds the tasks. An item is done when its PR is merged and
its screens are ungated in `components/mgr/screens.tsx`. It then leaves this
file via a `TODO: <unique substring>` line in the PR description (see
`AGENTS.md` step 6). This file only shrinks.

Counts come from a source read of the 167 MGR (non-venue) inventory screens
against `app/`: 55 live, 13 partial, 32 missing but ungated, 67 gated.

## Definition of done

A screen is done when a live route exists, uses `E.*` + `CommandForm`, and has
the same job, fields, verbs, and states as its `SCREENS` record; the record's
`writes` carries no SCHEMA-GATE / IMPLEMENTATION-GATE / design tag; the
`tests/screen-command-gates.test.ts` and Program 10's parity test are green.

## Phase 1 — backend programs (in order; each is a PR stack)

| # | Program | Plan | Tasks |
| --- | --- | --- | --- |
| 0–4b | Harness, ordering, bins/transfers, catalog identity, channels, pricing | `.agents/superpowers/plans/2026-09-07-backend-database-integration.md` | — |
| 5 | Production and packaging | `.agents/superpowers/plans/2026-09-07-backend-program-5-production-packaging.md` | 28 |
| 6 | Purchasing (vendors, POs, receipts, contracts, lead times) | `.agents/superpowers/plans/2026-09-07-backend-program-6-purchasing.md` | 20 |
| 7 | Taproom and kegs (pools, events, fleet; not tap board) | `.agents/superpowers/plans/2026-09-07-backend-program-7-taproom-kegs.md` | 10 |
| 8 | Delivery and routes (save / depart / return, driver) | `.agents/superpowers/plans/2026-09-07-backend-program-8-delivery-routes.md` | 13 |
| 9 | Compliance (report, filing, registry, COLA) | `.agents/superpowers/plans/2026-09-07-backend-program-9-compliance.md` | 17 |

- [ ] 5 merged
- [ ] 6 merged
- [ ] 7 merged (needs 2)
- [ ] 8 merged (needs 2 phase 3)
- [ ] 9 merged

## Phase 2 — explorer remainder (`.agents/superpowers/plans/2026-09-07-backend-explorer-remainder.md`)

Order: 10 (parity test red early) → 11 ∥ 16 → 12 (needs 2 + 7) → 13 ∥ 15
(after 1) → 14 (after 12). Do not start one before its named gate closes in
tests.

| # | Program | Plan | Tasks | Closes |
| --- | --- | --- | --- | --- |
| 10 | Explorer parity | `.agents/superpowers/plans/2026-09-07-backend-program-10-explorer-parity.md` | 33 | shell pages, Search, Permission denied, Session expired, Entity picker, password reset (staff + portal), Portal sign-in / Me, confirmation screens, Team role/revoke, Invoices, Question invoice |
| 11 | Access and import | `.agents/superpowers/plans/2026-09-07-backend-program-11-access-import.md` | 22 | Create brewery, Accept / Expired invite, Invite portal user, Import, First-run invite/import |
| 12 | Taproom truth | `.agents/superpowers/plans/2026-09-07-backend-program-12-taproom-truth.md` | 21 | Weekly count, Variance by brand, Tap board, Kick / Swap keg, SKU reverse, complete_batch, loss queue |
| 13 | QuickBooks | `.agents/superpowers/plans/2026-09-07-backend-program-13-quickbooks.md` | 17 | Connect / Disconnect / Mapping conflict / Fix mapping, Accounting push, Pay invoice |
| 14 | Square and menu | `.agents/superpowers/plans/2026-09-07-backend-program-14-square-pos.md` | 13 | Point of sale, Connect Square, locations, connector, Menu, POS item / mapping / sale detail |
| 15 | Composer | `.agents/superpowers/plans/2026-09-07-backend-program-15-composer.md` | 18 | Composer proposal / question / answer, Offline outbox |
| 16 | Chat settings | `.agents/superpowers/plans/2026-09-07-backend-program-16-chat-settings.md` | 9 | Chat disconnected / settings, Linked people, Disconnect Slack, Reauthorization |

- [ ] 10 parity test committed red
- [ ] 10 merged
- [ ] 11 merged
- [ ] 16 merged
- [ ] 12 merged (confirm the four §16.16 defaults in the remainder plan first)
- [ ] 13 merged
- [ ] 15 merged
- [ ] 14 merged

## Quick wins — registered commands with no caller in `app/`

Backend exists; each is a form or button. Most belong to Program 10 and can
land early as their own small PRs.

- [ ] `set_taproom_par`, `set_standing_allocation`, `release_allocation` on `/replenishment` (Pars and allocation)
- [ ] `replace_format_bom`, `replace_format_components` on Format (Package BOM)
- [ ] `move_stock_bin` on Location bins
- [ ] Search trigger in `components/mgr/app-shell.tsx` over `app/api/search`
- [ ] `set_notification_destination`, `set_notification_preference`, `set_brewery_quiet_hours` (Program 16 page at `/settings/chat`)
- [ ] `unlink_chat_user` (Linked people)
- [ ] `set_portal_fulfillment_source` (Settings)
- [ ] `invite_staff`, `invite_customer_user`, `import_csv` — wait for Program 11's gate

## Partial pages to finish (Program 10 unless noted)

- [ ] Beer / Work / More area pages: drop `planned` children as 6, 7, 8, 9 land
- [ ] Taproom persona rows on Today (Program 12)
- [ ] Confirm order and Complete transfer review screens
- [ ] Ship on delivery exposes `invoice_timing = on_delivery`
- [ ] Customer detail portal-invite section (Program 11)
- [ ] No membership as its own entry screen

## Spec drift to close (`.agents/superpowers/plans/2026-09-07-screens-drift.md`, uncommitted in the root worktree)

Owner tagged there. Schema-affecting ones gate the programs above.

- [ ] Guest keg identity (§16.13) — before 7 / 12 swap
- [ ] Taproom TTB removal types — before 12
- [ ] Taproom role: do not ship; Weekly count uses warehouse — before 12
- [ ] Lot trace vs `ship_order_impl` lot_id — before 9
- [ ] UI-plan §2 missing verbs (disconnect-QBO, write-off, invoice-question, push-defaults)
- [ ] Invoice timing self-disagreement — Program 5/10
- [ ] Review order Tax $0.00 — Program 13
- [ ] Sections A–D of the screens pass (ungate what 1–4b landed, add missing frames, fix contradicting copy)

## Never a live MGR route

The 17 venue frames (Slack, QuickBooks, Square) stay in `/docs/integrations`;
Programs 13, 14, 16 implement the actions they describe.

## Outside the screen inventory

- [ ] Authz backlog (`docs/audits/2026-09-01-authz-audit.md`): D2, A1–A5; re-triage against the definer/request-ledger baseline before picking any up
- [ ] Adversarial walkthrough baseline (`.agents/superpowers/specs/2026-09-04-adversarial-walkthrough-review.md`): map the `/docs/screens-explore` walkthrough against it per its entry template
- [ ] Supabase advisors on a hosted project (local `db lint` is clean)

## Release — no plan owns this yet

- [ ] Hosted Supabase project (ask first)
- [ ] Vercel project and env (ask first)
- [ ] README's login → catalog → inventory verification on the hosted project
- [ ] Database-backed suites green in CI on every merge above
