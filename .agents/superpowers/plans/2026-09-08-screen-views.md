# Screen views — convert every MGR drawing to one component

Date: 2026-09-08
Status: In progress (packs 0–4 landed on `screen-view-order`; one pack per PR applies after this PR)
Worktree: `.agents/worktrees/screen-view-order`

**Goal:** The inventory record and the live page cannot drift. One view owns the drawing; a mock feeds `/docs/screens`; an adapter feeds the app.

**Not the goal:** Split `components/mgr/screens.tsx` into area files (optional later). Convert venue frames (QBO / Square / Slack). Import `SCREENS` into `app/`.

Program 10 still says live pages must not import inventory **bodies**. That stays. Pages import the **view**, not the record.

## The loop (copy this)

Proven on Order. Each later screen is the same eight steps, one screen (or one sheet) per commit inside a pack PR.

1. **Red.** In `tests/<pack>-view.test.ts`: the named record's `body` is `<XView model={MOCK} />`; the live file imports that view and has no `E.*` tree of its own.
2. **Fixture.** Add a get_order-shaped (or matching command) snapshot under `lib/mgr/fixtures/`, reusing `lib/mgr/fixtures/demo.ts` identities. Do not put sample data on the view.
3. **View.** `components/mgr/views/<name>.tsx` draws only `E.*` from the view-model. Fixture verbs draw when `footer` / `lineAction` are omitted. Inventory-only chrome (compliance note, movement preview tape, a fulfillment pick) is a view prop, not domain data.
4. **Adapter.** `toXViewProps(snapshot)` paints both the inventory frame (`body: <XView model={toXViewProps(fixture)} />`) and the live page. Never hand-write a view-model literal.
5. **Page.** Fetch, `toXViewProps(...)`, fill slots, return `<XView />`. No `E.` in the page.
6. **Reconcile.** If inventory and live disagree on a field, pick one owner (a `lib/mgr/` helper like `nextState`, else the inventory drawing) and put it in the view. Do not leave two copies.
7. **Green.** Pack tests + `tests/mgr-screens.test.ts` + `tests/tap-coverage.test.ts` + `tests/app-screen-parity.test.ts` + `bunx tsc --noEmit`.
8. **Eyeball.** Inventory frame (`/screens/frame/<i>`) and the live route. Close the browser session.

Sheets (`surface: "sheet"`): the view is the CommandForm **body**. `ScreenSheet` already wraps inventory sheets. Live `*-form.tsx` renders the same view inside `CommandForm` plus submit. Do not draw a second field list.

Several records on one live file (Order, Adjust lines, Pick, … on `orders/[id]`): one view per **record name**, mounted by the page or form that actually shows that job.

## Conversion checklist (every pack)

Would have caught the dummy Pars adapter, href leaks, dropped Pick/Open, suppressed question/footer, and missing portal-guide updates:

1. **No invented domain.** Live `toXViewProps` never fabricates a SKU, ATP, unit, or barrel volume the command did not return. Optional fields stay omitted.
2. **No live href defaults.** Adapters pass `backHref` through only when the caller set it. Inventory `toXViewProps(fixture)` leaves it undefined so `E.back`/`E.act` stay `"#"`. A test renders inventory HTML and forbids `href="/orders`, `href="/portal`, `href="/customers`, `href="/invoices`.
3. **Live verbs survive.** Diff the pre-extract page against the view: every status-gated verb (Pick vs Open, separate detail links and Reorder/Continue actions in history, Reorder on detail, Question on every invoice state) still draws. Inert verbs that do not navigate are omitted, not faked.
4. **Slots, not flags.** `footer === undefined` keeps inventory defaults; `footer={null}` suppresses them. Question/detail/filters slots render in every state the live page uses. No `mode` / `readOnly` boolean that switches trees.
5. **Guides match what ships.** Staff-guide and portal-guide sections for the converted screens name the fields and verbs the view actually draws (order note, issued date, Credit vs paid, list vs detail Reorder).

## Constraints

- **One pack per PR — after this proof PR.** Packs 0–4 (Order, Orders family, Portal, Customers, Catalog + locations + pricing) landed together here so inventory and live could not drift mid-conversion. Later packs are one pack per PR: `screens.tsx` is still one file; two agents editing it is the failure the worktree rule exists to prevent.
- **Convert live screens first.** A record with no `SCREEN_ROUTES` row waits until the program that ungates it. Extract view+mock in that same PR, not earlier.
- **Venue frames stay fixtures** in `venue.tsx`. They are not MGR `E.*`.
- **Do not add a `mode: "fixture" | "live"` flag.** Slots and optional fields.
- **Do not import `SCREENS` from `app/`.**
- **Generic test later.** After two or three packs, replace copy-pasted “body.type === XView” checks with a `SCREEN_VIEWS: Record<string, Component>` map that `tests/app-screen-parity.test.ts` walks. Do not invent that map on the first follow-up.

`TODO.md` definition of done still says “uses `E.*` + `CommandForm`”. After a pack converts, that page uses the view; parity already accepts `from "@/components/mgr/views/…"`. Update the sentence in `TODO.md` only when the first pack after Order merges (this file is not that PR’s job unless Order is the merge).

## Packs (do in this order)

Counts are `SCREEN_ROUTES` rows (live or parity-mapped). Order is 1 of ~110. Gated records (Programs 11–16, SCHEMA-GATE) are listed under “with the program that ungates them”.

| # | Pack | Folder | Records (live today) | Why this order |
| --- | --- | --- | --- | --- |
| 0 | **Order (done)** | `components/mgr/views/order.tsx` | Order | Proof |
| 1 | **Orders family** | `views/orders/` | Orders, New order, Confirm order, Complete transfer, Adjust lines, Short pick, Pick, Ship and invoice, Shipment done, Ship on delivery, Return and credit, Put back, Pick sheet, Pars and allocation, Invoice | Same owner as Order; closes the leftover seams (Adjust / Add line / Ship in the view vs `LifecycleButtons`) |
| 2 | **Portal (done)** | `views/` | Shop, Review order, Order history, Order detail, Invoice history, Pay invoice, Question invoice, Payment unavailable, Paid invoice, Account, Portal Me | Shares `INV` and order identity; customer-role commands only. Live Cart / QuestionForm / MeSheet stay wrappers. |
| 3 | **Customers (done)** | `views/` | Customers, Customer detail, Ship-to form | Feeds orders; small. Live CustomerForm / ShipToForm stay wrappers. |
| 4 | **Catalog + locations + pricing (drawings extracted)** | `views/catalog/` | Catalog, Brand, SKU, SKU list, Formats, Format, Package BOM; Locations, Location detail, Location bins, Bin; Price groups, Price group; Sale channels, Channel; Units | One command-module family (`catalog.ts` + pricing) |
| 5 | **Inventory + transfers** | `views/inventory/` | Finished goods, Record movement, Movement recorded; Transfers, New transfer, Transfer detail | Ledger grain; keep append-only copy in the view |
| 6 | **Shell** | `views/shell/` | Today, Today empty, Sales, Brewer, Driver, Taproom, First-run checklist; Beer, Work, More; Search, Entity picker; Me, Settings, Team; Permission denied; Sign in, Session expired, Reset / Set password, Portal sign in / forgot / set password, No membership | High traffic; several records share `app/(app)/page.tsx` — one view per record name, or one landing view with mocks |
| 7 | **Production** | `views/production/` | Batches, Schedule batch, Brew day, Vessel detail; Close packaging run, Run closed; Recipes, Recipe | Live pages exist; cellar sheets (reading, addition, transfer, map) convert when they have routes |
| 8 | **Purchasing** | `views/purchasing/` | Purchase orders, New PO, Receive PO, Receipt; Materials on hand, Cycle count, Materials, Material; Vendors, Vendor, Contracts, Contract | Program 6 pages |
| 9 | **Kegs** | `views/kegs/` | Keg fleet, Customer keg balance, Keg event history | Not tap board (Program 12) |
| 10 | **Delivery** | `views/delivery/` | Routes, Route, Return route, Driver route, Confirm delivery | Program 8 pages |
| 11 | **Compliance** | `views/compliance/` | Compliance months, Compliance registry, Brand approval, State registration, License, Lot trace | Program 9 pages |

### Convert with the program that ungates them (not now)

Do not pre-extract these. When that program ships the live page, the page **is** a view from the first commit.

| Program | Records |
| --- | --- |
| 11 Access / import | Create brewery, Accept / Expired invite, Invite portal user, Import, First-run invite/import rows |
| 12 Taproom truth | Weekly count, Variance by brand, Tap board, Kick / Swap keg, cellar loss / complete_batch review |
| 13 QuickBooks | Connect / Disconnect / Mapping conflict / Fix mapping, Accounting, Pay invoice (portal) |
| 14 Square / menu | Point of sale, Connect Square, locations, connector, Menu, POS item / mapping / sale detail, Taproom sale, Refund |
| 15 Composer | Composer proposal / question / answer, Offline outbox |
| 16 Chat | Chat disconnected / settings, Linked people, Link Slack, Disconnect Slack, Reauthorization |
| later | Packaging runs list, Schedule packaging run, Repack, Mash / fermentation / water schedule sheets, Planning, SKU detail, Coming up, Monthly compliance, Keg report, Water profiles |

### Never

- QuickBooks / Square / Slack **venue** frames (`s.venue`)
- Annotation-only `states:` captions that do not change the drawing

The shared catalog/customer/location/pricing wrappers retain the live mutation forms as slots. Field-level form conversion remains separate; extracted fixture sheets are not a claim that those controlled forms have been replaced. Poured formats remain brand-owned, with ounces and no invented keg ratio.

## Pack 1 — Orders family (done in this PR)

Close the seams Order left:

1. Move `views/order.tsx` to `views/orders/order.tsx` (re-export if you want a stable import) only if the rest of the pack lands in `views/orders/`. Otherwise leave Order where it is and add siblings under `views/orders/`.
2. **Confirm order** and **Complete transfer** — done (own pages).
3. **Put back** — done (own page).
4. **Orders** list + **New order** sheet — done (list is shared; live create stays `order-form.tsx` because `E.pick` is not a controlled CommandForm).
5. **Adjust lines**, **Pick**, **Short pick**, **Ship and invoice** / **Ship on delivery** / **Shipment done**, **Return and credit** — inventory mounts the views. Live create/edit stays the CommandForm files (`adjust-lines-form.tsx`, `pick-form.tsx`, `short-pick-form.tsx`, `ship-form.tsx`, invoice `credit-memo-form.tsx`) because `E.stq` / `E.pick` are not controlled inputs (same as New order).
6. **Pick sheet**, **Pars and allocation**, **Invoice** — done (list/detail pages mount the views; live Pars still slots `ReplenishForm` and has no order-allocation join yet).

Stop after this pack and check: adding a field to an order line updates `/docs/screens` Order and `/orders/[id]` together.

## What “done” means for a pack

- Every record in the pack with a `SCREEN_ROUTES` row mounts its view from both inventory and live.
- `tests/<pack>-view.test.ts` (or the generic `SCREEN_VIEWS` map) fails if either side draws a second tree.
- Tap labels on fixture verbs still resolve (`tests/tap-coverage.test.ts`).
- Staff or portal guide updated only when a visible field, verb, or state actually changed — not for the extract itself.

## Agent working set

A pack agent reads only:

- `components/mgr/views/<pack>/`
- `lib/mgr/<pack>-view.ts` (adapter)
- `lib/commands/<area>.ts`
- `app/(app)/<area>/` or `app/(portal)/…`
- the records it is converting (search `name: "…"` in `screens.tsx`; do not read the rest)
- `components/mgr/e.tsx` (kernel)
- this plan + the Order files as the template

It does not read purchasing to convert orders. If a tap or command crosses a pack, stop and hand off.
