# TODO — everything left to match `/docs/screens-explore`

Index written 2026-09-07 against `main` @ `b3f6a91` (Programs 0–4b merged) with
Program 5 open as PR #194 on `lane-production`. This is the checklist; each
program's own plan holds the tasks. An item is done when its PR is merged and
its screens are ungated in `components/mgr/screens.tsx`; move it to Done at the
bottom with the date and PR, don't tick it. The dreaming workflow does this
from merged PR descriptions.

Counts come from a source read of the 167 MGR (non-venue) inventory screens
against `app/`: 55 live, 13 partial, 32 missing but ungated, 67 gated.

## Definition of done

A screen is done when a live route exists, uses `E.*` + `CommandForm`, and has
the same job, fields, verbs, and states as its `SCREENS` record; the record's
`writes` carries no SCHEMA-GATE / IMPLEMENTATION-GATE / design tag; the
`tests/screen-command-gates.test.ts` and Program 10's parity test are green.

## Phase 1 — backend programs (in order; each is a PR stack)

| # | Program | Plan | Tasks | Status |
| --- | --- | --- | --- | --- |
| 0–4b | Harness, ordering, bins/transfers, catalog identity, channels, pricing | `2026-09-07-backend-database-integration.md` | — | merged #185 |
| 5 | Production and packaging | `backend-program-5-production-packaging.md` | 28 | PR #194 green, unmerged |
| 6 | Purchasing (vendors, POs, receipts, contracts, lead times) | `backend-program-6-purchasing.md` | 20 | not started |
| 7 | Taproom and kegs (pools, events, fleet; not tap board) | `backend-program-7-taproom-kegs.md` | 10 | not started |
| 8 | Delivery and routes (save / depart / return, driver) | `backend-program-8-delivery-routes.md` | 13 | not started |
| 9 | Compliance (report, filing, registry, COLA) | `backend-program-9-compliance.md` | 17 | not started |

- [ ] 5 merged
- [ ] 6 merged
- [ ] 7 merged (needs 2)
- [ ] 8 merged (needs 2 phase 3)
- [ ] 9 merged

## Phase 2 — explorer remainder (`backend-explorer-remainder.md`)

Order: 10 (parity test red early) → 11 ∥ 16 → 12 (needs 2 + 7) → 13 ∥ 15
(after 1) → 14 (after 12). Do not start one before its named gate closes in
tests.

| # | Program | Plan | Tasks | Closes |
| --- | --- | --- | --- | --- |
| 10 | Explorer parity | `backend-program-10-explorer-parity.md` | 33 | shell pages, Search, Permission denied, Session expired, Entity picker, password reset (staff + portal), Portal sign-in / Me, confirmation screens, Team role/revoke, Invoices, Question invoice |
| 11 | Access and import | `backend-program-11-access-import.md` | 22 | Create brewery, Accept / Expired invite, Invite portal user, Import, First-run invite/import |
| 12 | Taproom truth | `backend-program-12-taproom-truth.md` | 21 | Weekly count, Variance by brand, Tap board, Kick / Swap keg, SKU reverse, complete_batch, loss queue |
| 13 | QuickBooks | `backend-program-13-quickbooks.md` | 17 | Connect / Disconnect / Mapping conflict / Fix mapping, Accounting push, Pay invoice |
| 14 | Square and menu | `backend-program-14-square-pos.md` | 13 | Point of sale, Connect Square, locations, connector, Menu, POS item / mapping / sale detail |
| 15 | Composer | `backend-program-15-composer.md` | 18 | Composer proposal / question / answer, Offline outbox |
| 16 | Chat settings | `backend-program-16-chat-settings.md` | 9 | Chat disconnected / settings, Linked people, Disconnect Slack, Reauthorization |

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

## Spec drift to close (`2026-09-07-screens-drift.md`, root worktree)

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

## Release — no plan owns this yet

- [ ] Hosted Supabase project (ask first)
- [ ] Vercel project and env (ask first)
- [ ] README's login → catalog → inventory verification on the hosted project
- [ ] Database-backed suites green in CI on every merge above

## Done

- 2026-09-07 — Programs 0–4b: harness, ordering pilot, locations/bins/transfers, catalog identity, sale channels, pricing grid (#185)
