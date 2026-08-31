# MGR — UI layout plan (all slices, mobile-first, chat-first input)

Date: 2026-08-31
Status: Draft for Ted. Nothing built; the current shell (`app/(app)/layout.tsx`, a 208px
left rail with five links and Geist) is the placeholder this replaces.
Inputs: `2026-08-30-mgr-slice1-core-orders-design.md` (roles, slices, ≤2-interaction rule,
AI-first command registry), `2026-08-31-mgr-schema-design.md` (what exists to show),
`brewing-domain.md` (units people actually say).

## 1. Who is holding the device, and where

| Person | Device, conditions | What they do most |
|---|---|---|
| Cellar / brewer | Phone, one hand, wet gloves, tank-side, wifi drops behind stainless | Log a gravity/temp reading, record a transfer, note a loss, close a packaging count |
| Warehouse | Phone in a cooler; sometimes a wall tablet | Pick an order (count → tap), ship, receive a PO, record a keg blown at the taproom |
| Taproom lead | Phone, end of shift | Weekly count, "we're out of X", request a transfer |
| Sales / admin | Laptop; phone when out | Confirm orders, invoices, QBO, price lists, catalog, import, team, reports |
| Wholesale customer (portal) | Phone, at their bar, ordering for the week | Place/repeat an order, check status, see invoices |
| Delivery driver (slice 10) | Phone, in the truck | Load list, confirm drop, invoice-on-delivery |

Rule that follows: **anything a person does standing up is a phone-first flow; anything done
sitting down is desk-first but still works on a phone.** The split is by posture, not by
role — an admin at a festival still records a `festival_removal` on a phone.

## 2. Input model: say it, check it, commit it

Every write in MGR is already a command with a Zod schema. The UI's job is to get a person
from intent to a validated command with the fewest taps. Three doors, one room:

1. **Composer (chat/text) — primary on phone.** A persistent bar at the bottom of every
   screen. Type or dictate: *"blew a half of Hazy at the taproom"*, *"gravity 1.012 FV3"*,
   *"received 40 bags 2-row from Country Malt"*. The model maps it to a command and returns
   a **proposal card**: the exact ledger row(s) it is about to write, in the schema's own
   fields, each field tappable to correct. One tap on **Commit**. High-stakes commands
   (`ship`, QBO push) require the confirm step; low-stakes ones (a reading) can be set to
   auto-commit per user.
2. **Forms — required, never second-class.** Every proposal card has **Open as form**, and
   every area has a direct "+" action that opens the same form cold. Forms are the
   authoritative UI for the schema; the composer is a faster way to fill them. One form
   pattern everywhere (spec: consistency beats local perfection).
3. **Quick actions — the phone's home screen.** Big buttons for the top tasks of the
   current role/time (`Record depletion`, `Pick`, `Reading`, `Transfer`). Each opens a
   form pre-filled with the obvious defaults (last vessel, today's picks) so the common
   case is *count → confirm*.

Design consequences:

- **Numbers are the product.** Quantity fields open a large custom numeric pad with unit
  chips (`kegs · ½ bbl · cases · bbl`, or `°P · SG`, `°F · °C`) and a live conversion
  line underneath ("= 0.5 bbl"). Never a bare `<input type=number>` for the primary qty.
- **Pickers remember.** SKU, vessel, location, customer pickers show recents first, then
  search. Two taps for the 90% case.
- **Every commit echoes as a ledger line.** The confirmation is the row that was written
  (`−1 × Hazy ½bbl · taproom · depletion · 9:41`), with **Undo** = write the reversal row.
  The append-only ledger is visible, not hidden behind a "saved" toast.
- **Offline-tolerant, not offline-first.** Composer and forms queue commits locally and
  replay when the wifi returns; a queued row shows a hollow dot until the server echoes.
  No sync engine — a small outbox in IndexedDB keyed by idempotency id.
- **Chat is also the help.** *"how much Hazy can I promise Friday?"* runs the ATP query and
  answers with the number and a link to the shortfall view. Same composer, no mode switch.

## 3. Navigation shell

### Phone (≤ 768px)

```
┌─────────────────────────────┐
│ ◐ Demo Brewing        ⌕  ⚙ │  ← brewery switcher (saas only) · search · me
│                             │
│  [Today]                    │  ← page content
│  ▸ 3 orders to pick         │
│  ▸ FV3 reading overdue      │
│  ▸ Taproom: Pils below par  │
│                             │
│  Record ▸  Pick ▸  Reading ▸│  ← quick actions, role-ordered
│                             │
├─────────────────────────────┤
│ 💬 Say what happened…   🎤 │  ← composer, always present
├───────┬───────┬──────┬──────┤
│ Today │ Beer  │ Work │ More │  ← 4 tabs
└───────┴───────┴──────┴──────┘
```

- **Today** — the inbox: things due or wrong, from every slice (picks due, readings overdue,
  taproom below par, POs arriving, QBO push failed, TTB month closes in 3 days). Empty
  state: "Nothing waiting. Tell me what happened below." Every item deep-links to its
  action pre-filled.
- **Beer** — what we have: FG on-hand/ATP by SKU and location (slice 1), cellar map of
  vessels with what's in them (4), materials on hand (2), keg fleet balances (9). One
  screen, sectioned; each section collapses to its total.
- **Work** — what's in motion: orders (1), batches (4), packaging runs (5), POs (2),
  deliveries (10). A single list filtered by kind and status, newest-action first.
- **More** — the desk things: catalog, customers, price lists, recipes, reports, planning,
  settings, import, team. Fine to be two taps deep on a phone; they are desk tasks.

### Desktop (> 768px)

Same four groups become a left rail with the sub-areas expanded; the composer becomes a
**⌘K palette** anchored top-center that accepts the same sentences and shows the same
proposal card. Content gets two columns where it earns it (order list + detail; vessel map
+ readings). No third breakpoint; tablets get the desktop layout.

The portal (`/portal`) is a separate shell: Order · Orders · Invoices · Account, same
composer restricted to portal commands ("same as last week" → repeat order proposal).

## 4. Area by area

Each row: the screen's one job, phone-first pattern, and the desk extras. "Card" means the
one list-item component; "sheet" means the one bottom-sheet/dialog form component.

| Area (slice) | One job | Phone | Desk extras |
|---|---|---|---|
| **Today** | Tell me what needs doing | Prioritised list, each row = action button | Same, plus a week strip of ship dates / brew days |
| **Inventory** (1) | How much do we have and can we promise | SKU cards: on-hand, allocated, **ATP** big; tap → per-location + movement tape | Table with location columns; movement ledger with filters; shortfall view |
| **Record movement** (1) | Write one ledger row fast | Sheet: type chips (depletion · loss · sample · festival · adjustment), SKU picker, qty pad, location; channel/dest_state appear only when the type needs them (CHECK constraint mirrored in UI) | Same sheet |
| **Orders** (1) | Move an order to the next state | Work list; order card shows status stepper `draft → submitted → confirmed → picked → shipped`; the single primary button is the next transition | Order + lines side by side; ATP inline on each line; confirm with soft availability warning |
| **Pick** (1) | Count what's on the pallet | Per-order pick list: line → tap qty pad → picked qty; short lines flagged; **Done picking** | Daily pick sheet grouped by ship date; print |
| **Ship** (1) | Commit the removal | Reads picked qtys, shows the sale_removal rows it will write, **Ship** (confirm-gated) | Same; invoice generated, QBO status |
| **Taproom** (1, 7) | Keep the taproom stocked and honest | Par vs on-hand bars; **Request transfer** one tap; depletion entry (count or keg-blown) | Replenishment view; Square reconciliation (7) |
| **Customers / ship-tos** (1) | Who buys, where it goes | Card list, search first | Table; price list + QBO mapping |
| **Catalog** (1) | Define what we sell | Read-mostly on phone | Product → SKUs tree; bbl_per_unit shown as fraction and decimal; BOM tab (5) |
| **Invoices / QBO** (1) | Get paid | Status list, retry push | Per-shipment invoices; mapping UI for unmapped customers/items; payment status |
| **Materials / receiving** (2) | Receive what arrived, know what's short | Receive sheet per PO: expected vs counted per line, over/short auto-flagged; lot no. field only if `lot_tracked` | PO list; requirements engine view (required / on hand / incoming / short → draft PO) |
| **Recipes** (3) | Author and scale | Read; scale-to-batch calculator | Version editor; costing |
| **Cellar** (4) | Know every tank, log every reading | **Vessel map**: one tile per vessel, colour = days since last reading; tap → reading sheet (temp/pH/gravity pad, unit chips, last value ghosted) | Batch timeline; transfers/blends as a lineage graph |
| **Transfers / losses** (4) | Move beer, account for what didn't make it | Sheet: from occupancy → to vessel, volume pad, "vessel held X, moving Y — record Z loss?" prompt | Same |
| **Packaging** (5) | Close a run with real counts | Pre-run checklist (required / on hand / short); run sheet: units packaged pad → material consumption preview → returns/damage | Run list; lot codes; yield/loss per run |
| **Compliance** (6) | File the month | Read-only status: month open/closed, unattributed loss count | BRO table per tax class; per-state excise; filed snapshots; "review auto-reconciled losses" queue |
| **Planning** (8) | See the gap | Read-only shortfall cards | Demand vs supply calendar; "draft PO" actions |
| **Keg fleet** (9) | Who has our kegs | Per-customer counts; return entry sheet | Pools, deposits, loss rates |
| **Deliveries** (10) | Get it there | Driver mode: today's route, load list, per-stop **Delivered** with qty adjust → invoice | Route builder |
| **Settings** | Rarely | Team, import, integrations, brewery | Same |

Portal: **Order** (catalog with assigned prices, cart, repeat-last), **Orders** (status),
**Invoices**, **Account** (ship-tos, users).

## 5. Visual system

The subject is a working brewhouse: stainless, kraft, chalk marker, brass gauges. The
aesthetic risk: **the UI is a ledger tape.** Committed rows render as monospaced ledger
lines with a left rule, newest at the bottom, the same everywhere a write happens — the
inventory tape, the vessel's reading tape, the order's event tape. It makes the
append-only model legible and makes "undo" obviously "write a reversal".

**Color** (light-first; dark mode inverts ground and ink, keeps accents):

| Token | Hex | Role |
|---|---|---|
| `--ground` | `#EEF0EE` | stainless off-white page |
| `--surface` | `#FFFFFF` | cards, sheets |
| `--ink` | `#16201B` | text |
| `--hop` | `#1F4D3A` | primary actions, active nav |
| `--copper` | `#B5652E` | **Commit** and irreversible writes only — nothing else is copper |
| `--wort` | `#C99A2E` | warnings: overdue reading, ATP negative, short pick |
| `--rule` | `#C9CFCA` | hairlines, the ledger's left rule |

**Type:** display *Familjen Grotesk* (headings, big numbers on quick actions — used with
restraint); body *Instrument Sans*; data *JetBrains Mono* for every quantity, unit, time,
and ledger line. Numbers set with `font-variant-numeric: tabular-nums` everywhere.
Scale: 12 / 14 / 16 (body) / 20 / 28 / 44 (the one big number per screen).

**Layout:** 16px phone gutter, 8px grid, cards with 4px radius (not pills — this is
equipment, not a consumer app). Touch targets ≥ 48px; primary buttons full-width on phone.
Bottom composer and tab bar sit above the safe area.

**Motion:** one moment — a committed proposal card **drops into the ledger tape** (200ms,
`prefers-reduced-motion` → instant). Nothing else animates.

**Copy:** verbs name the write: *Record*, *Pick*, *Ship*, *Receive*, *Transfer*. The button
says the same word as the resulting tape line. Errors say what to change ("Depletions
need a channel — taproom or wholesale?"), never "invalid input".

## 5b. Build rules: shadcn for every element, Hugeicons for every icon (Ted, 2026-08-31)

- **Every interactive element is a shadcn/ui component** added via the CLI into `components/ui/`
  (never hand-edited — `.agents/ARCHITECTURE.md` ownership table). No bespoke buttons, inputs,
  sheets or menus. Where shadcn lacks a primitive (the `QtyPad` keys, `VesselTile`), compose
  it from `Button`, `Card`, `Badge` and Tailwind; do not reach for another library.
  Theme via shadcn CSS variables: `--primary` = hop, `--destructive` repurposed as *copper /
  irreversible*, a custom `--warning` = wort. Radius token `--radius: 4px`.
- **Icons are Hugeicons** (`@hugeicons/react` + `@hugeicons/core-free-icons`, stroke-rounded
  set, 1.5px), replacing `lucide-react`, which is removed. Icons appear **only where a word
  cannot do the job**: the four tab glyphs, mic, close, back chevron, the queued/committed
  dot, and status marks in dense tables. Buttons are words. No icon-only buttons without a
  visible label except close/back/mic. Adding Hugeicons is a dependency change — approved
  by Ted in this decision; still lands as its own commit.
- **Polish checklist** (every screen, every PR):
  - Spacing on the 4/8 grid only; one type scale; tabular numerals on every number.
  - Every control has hover, focus-visible, pressed and disabled states from the shadcn
    variants; nothing custom.
  - Every list has a designed empty state that says what to do next; every async read has a
    skeleton in the exact shape of the loaded content; no spinners.
  - Every write gives feedback in ≤100 ms (optimistic tape row) and the button's verb matches
    the tape line's verb.
  - Sheets and the tab bar respect the safe area; touch targets ≥ 48px; phone forms use
    `inputmode`/`enterkeyhint` correctly.
  - Dark mode is designed, not inverted: hop and copper lighten on dark ground.
  - One motion (card → tape), `prefers-reduced-motion` honoured; everything else instant.
  - Copy in sentence case, verbs first, errors say what to change.

## 6. Component inventory (small, composed from shadcn)

Each maps to shadcn primitives: `Composer` = `Command` (cmdk) + `Textarea` + `Card`; `QtyPad` = `Button` grid + `ToggleGroup` (units); `EntityPicker` = `Command` in a `Drawer`; `LedgerTape` = list + `Badge`; `StatusStepper` = `Badge` + `Separator`; `ActionCard` = `Card` + `Button`; `Sheet` = shadcn `Drawer` (phone) / `Sheet` (desk); `VesselTile` = `Card` + `Progress`; tabs = `Tabs`; tables = `Table`; toasts = `Sonner`.

`Composer` (text + mic + proposal card) · `QtyPad` (numeric pad + unit chips + conversion
line) · `EntityPicker` (recents + search; used for SKU, vessel, location, customer, material)
· `LedgerTape` (list of committed rows, undo) · `StatusStepper` (orders, POs, batches) ·
`ActionCard` (Today rows and quick actions) · `Sheet` (the one form container) ·
`VesselTile` (cellar map). Everything else is a page composing these; no page-specific
form components until the rule of three.

## 7. Build order (each a small PR, on the existing slice plan)

1. Shell: 4-tab phone nav + desk rail, brewery header, Today page (reads only what slice 1
   has: picks due, negative ATP, taproom below par). Replace the placeholder layout.
2. `QtyPad`, `EntityPicker`, `Sheet`, `LedgerTape`; rebuild the existing movement form on
   them (proves the pattern on real code).
3. Composer v1: text → proposal card → commit, over the existing registry; ⌘K on desk.
   Voice = browser SpeechRecognition where available; no server STT yet.
4. Orders / pick / ship screens as slice 1B lands.
5. Portal shell.
6. Each later slice adds its sheet + its Today rows; no new nav groups.

## 8. Open questions for Ted

- Auto-commit for low-stakes composer writes (readings, depletions) — on by default, or
  always confirm?
- Portal composer: worth it in v1, or forms only for customers?
- Dark mode: needed for the cellar at night, or defer?
- Wall tablet for the warehouse: treat as desktop (current plan) or its own kiosk layout?
