# Hugeicons — where icons go, and where they never do

Status: proposed 2026-09-03, awaiting approval before any icon lands.
Skill: `.agents/skills/hugeicons` (grep `references/icon-list.md`; never guess a name).
Dependency (ask-first per AGENTS.md): `@hugeicons/react` + `@hugeicons/core-free-icons`.

## The one rule

An icon appears only where it answers a question the text cannot answer fast
enough: **which kind of thing is this** in a mixed list, **what state is this**
when state changes what you may do, and **where am I** in navigation. Never on
homogeneous lists, verbs, buttons, ledger tapes, tables, chips, or the composer.
About twenty placements product-wide; most screens show two or three.

## Placements

1. **Navigation** — phone tab bar and desktop rail group heads only, never rail
   children. Staff: Today `Home01Icon`, Beer `BeerIcon`, Work `Package01Icon`,
   More `Settings01Icon`. Portal: Order `ShoppingCart01Icon`, Orders
   `Package01Icon`, Invoices `Invoice01Icon`, Account `UserCircleIcon`.
2. **State that changes what you may do** — `E.note` → `Alert02Icon`; `E.info` →
   `InformationCircleIcon`; `E.gated` → `SquareLock01Icon`; offline outbox rows
   and the header outbox count → `WifiDisconnected01Icon`.
3. **Mixed-kind lists** — a leading glyph per row kind, only where rows differ.
   Today: order `Package01Icon`, purchase order `DeliveryTruck01Icon`, delivery
   stop `Route01Icon`, fermentation reading `ThermometerIcon`, count
   `TaskDone01Icon`. Global search / entity picker: SKU `BeerIcon`, customer
   `UserMultipleIcon`, order `Package01Icon`, invoice `Invoice01Icon`, ship-to
   `Location01Icon`. Homogeneous lists get nothing; the amber/violet dots stay
   as the attention signal.
4. **Header** — `Search01Icon`, `UserCircleIcon`; icon-only on phone, icon and
   label on desk.
5. **Me sheet** — theme toggle `Sun01Icon` / `Moon01Icon`. Sign out stays a word.
6. **Docs** — landing cards and Fumadocs sidebar (`icon` frontmatter): Brewery
   staff `Factory01Icon`, Wholesale customers `Store01Icon`, Screen inventory
   `Layers01Icon`, Integrations `ArrowDataTransferHorizontalIcon`. Slack section
   `SlackIcon`. QuickBooks and Square have no marks in Hugeicons (`Square01Icon`
   is a shape) — those headers stay text rather than fake a brand.
7. **Empty states** — `E.blank` takes one muted contextual icon per use.

## Left alone, on purpose

`E.btn` / `E.act` verbs; the irreversible teal button (color already carries
it); `E.tape`; tables; chips; composer; venue frames (they speak the vendor's
language). Lucide stays inside `components/ui/*` for shadcn chrome.

## Treatment

`components/mgr/icon.tsx` pins 16px in rows and alerts, 20px in the tab bar,
stroke 1.5, `currentColor`, `aria-hidden` (adjacent text is the label). Icons
never take a color of their own.

## Order of work

Group 1 → screenshot pass → groups 2, 4, 5 → group 3 → screenshot pass → 6, 7.
If Today reads busy after group 3, its icons are the first cut.
