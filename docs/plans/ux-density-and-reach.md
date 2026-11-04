# UX: density and one-hand reach

Status: proposed (Phase 1), awaiting owner approval.
Branch: `ux/density-and-reach` (worktree `.agents/worktrees/ux-density-and-reach`), based on `main` @ 369360483.

## Goal

The owner asked for three things:

1. On a phone, navigation and actions sit where the thumb is.
2. Each screen shows more, with one line per fact where it fits, especially on the desk.
3. An icon replaces a word where that saves space.

## What the audit found

The audit captured 35 inventory frames (`/screens/frame/<i>`) at 390×844 and 1440×900.
They cover Today, the role homes, Work, Orders, Order, Pick, New order, Customer, Invoice, Cellar, Brew day, Receive PO, Materials, Compliance, Driver route and Planning.

| # | Finding | Where | Cost |
| --- | --- | --- | --- |
| F1 | On a phone, a page's main verb sits under the title, at the top of the screen. | `E.hd` / `E.back` action slot (129 callers); Order's Put back · Ship · Record pick; Batch's four stacked buttons; Cellar's 2×2 grid | The thumb has to reach the top. Up to 160px of buttons push the content down. |
| F2 | On a phone, a register record takes 3–5 lines. Each fact is printed as "Header value". | `RecordTable` phone list (13 views: Orders, Invoices, Batches, Finished goods, Catalog …) | Orders fits 4 records in the first screen. Two-line rows would fit 8. |
| F3 | A filter's label sits on its own line above the control. | `ScopePick` (11 callers), `ListControls` ("Type" on Materials) | Each filter costs one extra line at every width. |
| F4 | On the desk, a detail screen's facts span the whole column, one per line. | `E.fld` runs on Batch / Brew day ("Vessel … FV2" across 770px), Route, Receive PO | The label and its value are far apart. There is about 60% empty space. |
| F5 | A line item on a phone is a labeled three-column grid. | Invoice and Order line items (their own `md:hidden` drawing) | Each line takes 3 lines. "2 × $150.00 · $300.00" fits in 1. |
| F6 | On a phone, the header writes out "Search" and "Me". | `search-palette.tsx:115`, `me-sheet.tsx:43` | Space the brand and Ask MGR need. |
| F7 | Per-row secondary verbs are written as words. | Materials' Edit · Count, New order's "Remove" line under each line | Remove takes a whole line per order line on a phone. |
| F8 | Bug: the State label reads "State (required) (required)". | `components/mgr/views/customer.tsx:60` | Visible on Customer detail. |
| F9 | On the desk, Customer detail is one column of full-width fields. | `customer.tsx` account details | Short fields like Type, Country, State and License each take a full line. |
| F10 | On the desk, Today's Record movement / Receive PO sit on their own row under the title. | Today view | One wasted row. |

Already good, so the plan leaves these alone:

- The bottom tab bar (48px, safe area).
- The sticky Pick / Shop / Brew footers (#1747, #1748).
- Desk table row height.
- The Work kind tabs' scroll strip.

## Approach

Fix the shared owners first, so most screens improve with no change to the screens themselves. Then make a few per-screen passes.

No new dependency:
- Icons come from `@hugeicons/core-free-icons` through `components/mgr/icon.tsx`.
- Tooltips come from `components/ui/tooltip`.

Every icon-only control keeps an `aria-label` and a tooltip.

**Reuse.** These existing pieces carry the work:

- `BrewFooter` (`components/mgr/views/brew-prep.tsx:46`) already pins verbs to the phone's foot. It moves into `e.tsx` as the one footer, and its 4 callers switch to it.
- The `scroll-cue` utility (`app/globals.css`) handles a verb row that overflows.
- `E.pick`'s `displayValue` and `hideLabel` put a label inside its control.
- The two-column fact grid already used by Order details handles F4.

## Tasks

| # | Task | Files | Types | Test (written first, red) | Acceptance | Deps | Parallel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Move `BrewFooter` into `E.foot`. On a phone it is sticky at the scroll foot. On the desk it is inline and right-aligned. Switch the 4 callers to it and delete `BrewFooter`. | `components/mgr/e.tsx`, `views/brew-prep.tsx`, `views/brew-timeline.tsx`, `views/confirm-order.tsx`, `views/shop.tsx` | `(children: ReactNode) => JSX` | `tests/mgr-screens.test.ts` (no `BrewFooter` export remains; every caller renders `data-foot`) | tsc, the screen-proof suite | none | none |
| 2 | **F1.** On a phone, `E.hd` / `E.back` draw their `action` in `E.foot`. The header wrapper becomes `max-md:contents`, so the action is a child of `#main`, and `order-last` moves it to the foot. The DOM order stays the same, so tab order still meets the title first. | `e.tsx` | unchanged | `tests/mgr-screens.test.ts`: every frame with a header action renders it inside `[data-foot]` | tsc; screenshots of Orders, Customers and Materials show the verb above the tab bar | 1 | none |
| 3 | **F1.** A detail screen's verb group (`E.btns`, and Order / Batch / Cellar groups) draws in `E.foot` on a phone as one row. The primary verb fills the row and the others are compact. When the row overflows, it scrolls with `scroll-cue`. | `e.tsx`, `views/order.tsx`, `views/brew-day.tsx`, `views/cellar-map.tsx` | unchanged | `tests/mgr-screens.test.ts`: Order, Batch and Cellar verb groups render in `[data-foot]` | screenshots: one footer row, nothing above the facts | 1 | runs with 2 |
| 4 | **F2.** On the phone, a `RecordTable` record has two lines. The first line is the name, with the action cell trailing on the right. The second line joins the other facts with " · ", unlabeled. A right-aligned (numeric) cell keeps its header label, because "4" alone means nothing; the label is derived from `align`, not a new prop. The action becomes a row field `action?: ReactNode`, so it is never mistaken for a fact. | `views/record-table.tsx` and its 13 callers | `RecordTableRow.action?: ReactNode`; `phoneLabel(align): boolean` | `tests/record-table.test.ts`: a numeric cell is labeled, a text, date or badge cell is not, and the action renders in the trailing slot | tsc; the Orders phone frame fits ≥7 records in its first screen | none | yes |
| 5 | **F3.** `ScopePick` hides its label visually and shows "Status: All states" inside the trigger. The `aria-label` stays the plain label. `ListControls` scopes get the same treatment. | `components/mgr/scope-pick.tsx`, `list-controls.tsx` | unchanged | new `tests/scope-pick.test.ts`: the trigger text includes the label, and no visible `FieldLabel` is drawn | tsc; Orders and Materials lose one line | none | yes |
| 6 | **F6.** On a phone, the header's Search and Me buttons show only their icon or avatar. The word appears from md up. Both keep their `aria-label`. | `search-palette.tsx`, `me-sheet.tsx` | none | `tests/shell-view.test.ts`: the label is wrapped in `max-md:sr-only`, and the button keeps its `aria-label` | tsc; screenshot | none | yes |
| 7 | **F4.** Facts on Batch, Brew day, Vessel, Route and Receive PO move into the existing two-column (desk: four-column) fact grid. On a phone they stay as label-value lines. | `views/brew-day.tsx`, `views/vessel-detail.tsx`, `views/route.tsx`, `views/receive-po.tsx` | none | `tests/mgr-screens.test.ts`: these frames render their header facts in the grid | screenshots at 1440: the facts take ≤2 rows | none | yes |
| 8 | **F5.** On a phone, an Invoice or Order line item is one row: the SKU, then "qty × price", with the amount trailing. | `views/invoice.tsx`, `views/order.tsx` (their `md:hidden` blocks) | none | `tests/mgr-screens.test.ts`: a phone line item has no Quantity / Unit price labels | screenshot | none | yes |
| 9 | **F7.** Per-row secondary verbs become icon buttons with a tooltip and `aria-label`. This covers Remove on New order / Edit order lines (an × on the line's row, as the desk already does) and Edit on Materials, where Count stays a word because it is the row's main verb. | `views/new-order.tsx`, `views/materials-on-hand.tsx` | none | `tests/tap-coverage.test.ts` still passes; new assertion: the Remove button has `aria-label` "Remove <sku>" | tsc; screenshot | none | yes |
| 10 | **F8.** Drop the duplicated "(required)" on the State label. | `views/customer.tsx` | none | `tests/mgr-screens.test.ts`: no label text contains "(required) (required)" | tsc | none | yes |
| 11 | **F9.** On the desk, Customer detail's short fields sit in pairs with `E.cols`: Type + Country, State + License. | `views/customer.tsx` | none | (render-only, checked by eye) | screenshot at 1440 | 10 | after 10 |
| 12 | **F10.** Today's create verbs go in the `E.hd` action slot. That gives the desk the title row and gives the phone the foot from task 2. | `views/today.tsx` | none | `tests/mgr-screens.test.ts`: Today's verbs render in the header action | screenshot | 2 | after 2 |
| 13 | Update the guides and inventory specs where the visible layout changed: where the verbs are on a phone, icon-only Search and Me, and Remove as ×. | `content/docs/staff-guide.mdx`, `portal-guide.mdx`, `components/mgr/screens.tsx` specs | none | `tests/docs.test.ts`, `tests/design-docs.test.ts` | the screen-proof suite | 2–12 | last |

The proof for each task is the AGENTS.md screen-only proof (`bunx tsc --noEmit && bun run lint` plus the eight screen suites), and phone and desk screenshots of the touched frames. No schema, RPC or command changes, so there is no migration.

## Parallelism

- Tasks 4–10 touch disjoint files, so they can run in parallel.
- Task 1 comes before tasks 2 and 3.
- Task 11 waits for task 10. Task 12 waits for task 2. Task 13 goes last.
- Tasks 2 and 3 both edit `e.tsx`, so one agent does both, in order.

## Owner decisions

These are left out of the plan unless approved:

- **Desk sidebar.** It lists all ~40 links with every tab's children expanded, so it scrolls. One option is to expand only the active tab's children. That saves height but changes the #305 navigation, so it needs the owner's call.
- **Visual order on a phone.** Task 2 draws the header verb at the foot while it stays early in tab order. That is a deliberate break of visual and DOM order, made for reach. The alternative is to move the verb in the DOM, which means editing 129 callers.

## Out of scope

- Desk table row height, which is already dense.
- Bottom tab bar contents.
- Any new component library or dependency.
