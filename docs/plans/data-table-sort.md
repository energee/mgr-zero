# Data table sort: every column sortable, last sort remembered

Status: draft for approval 2026-10-22. Branch `feat/data-table-sort`, PR to `main`.
Dependency `@tanstack/react-table` (9.3.1) approved by the user 2026-10-22.

## Decisions (user, 2026-10-22)

| Question | Answer |
| --- | --- |
| Component | shadcn Data Table recipe: TanStack Table for the logic, the existing shadcn `Table` (Radix style, `radix-nova`) for the drawing. |
| Primitives | Radix. The repo is on Radix (20 files); Base UI is only `combobox`/`drawer`; React Aria is not installed. |
| Which columns | Every data column. A column with no visible header text (an action column) has nothing to sort. |
| Where sorting runs | In the browser, on the rows the page already loaded (`getSortedRowModel`). Derived cells (status, totals, labels) sort too. |
| Persistence | `localStorage`, one key per table. No cookie, no database. |
| Which pages | As many as possible: every `RecordTable` and every `E.tbl`, except where a row's position carries meaning (below). |

This supersedes `docs/plans/list-filters.md`'s "TanStack Table? No" row for
column sorting. Catalog's server-side Sort pick (`?sort=`) stays; a header
click re-orders the rows it returned.

## Known costs (accepted)

1. **The default order paints first.** The server cannot read `localStorage`, so
   a saved sort applies after hydration: one re-order on load.
2. **Paged lists sort within the page.** Orders and Invoices load one history
   page (`list_orders`/`list_invoices` `limit` + cursor). A header sort orders
   that page, not all history. The other registers load every row.
3. **The tables become client components.** About 15 kB of JavaScript; the
   server-rendered HTML is unchanged until hydration.

## How a cell becomes a sort value

Cells are `ReactNode`s; TanStack needs a plain value. One pure rule, in order:

1. The row's explicit `sort[i]`, when the caller gave one (new optional
   `RecordTableRow.sort`, parallel to `cells`).
2. Otherwise the cell's text: a string or number as is; a fragment or host
   element by its text children (`lastPart` already reads fragments in
   `record-table.tsx`). A function component (`<Available>`, `<Occupancies>`)
   has no readable text, so its caller passes `sort`.
3. Compare: a printed date (`PRINTED_DATE`, already in `record-table.tsx`) by
   its time; a figure (`$1,040.00`, `−$25.00`, `12.5%`, `1,234.5`) by its
   number; anything else with `Intl.Collator(undefined, { numeric: true })`, so
   `B-9` sorts before `B-12`. Empty cells sort last in both directions.

## Tables and exclusions

Sortable (14 tables on 12 screens): Orders, Invoices, Batches (each group) and
vessels, Finished goods, Formats, Catalog brands; `E.tbl` in format components,
close packaging run outputs, import preview and result, keg aging, planning
horizon, packaging planned materials and actuals, run closed outputs, schedule
packaging run materials, taproom variance, portal invoice lines.

Excluded, passing `sortable: false`:
- **Monthly compliance** class lines and state rows: they follow the TTB
  report's order, and staff copy them row by row onto the form.
- **Price groups** grid: its cells are inline editors and Add-pour buttons, and
  its rows are price groups in their saved order.

Row lists drawn with `E.nav` (Customers, Recipes, Vendors, Purchase orders,
Packaging runs, Materials, Portal orders, …) have no columns and are out of
scope. Converting any of them to a `RecordTable` is a separate screen change.

## Tasks

Each task starts with its failing test. Shared proof after each task:
`bunx tsc --noEmit && bun run lint` and the AGENTS.md screen-only test list.

1. **Add the dependency.** `bun add @tanstack/react-table@9.3.1`.
   Accept: `bun.lock` and `package.json` change; `bunx tsc --noEmit` clean.
   Depends on: none.

2. **Sort values and comparison** — new `lib/mgr/table-sort.ts`.
   Test first: `tests/table-sort.test.ts`.
   Types: `type SortValue = string | number | null`;
   `cellSortValue(cell: ReactNode): SortValue` (rule 2);
   `compareSortValues(a: SortValue, b: SortValue): number` (rule 3).
   Cases: dates across months and years; `$990.00` < `$1,040.00`; `−$25.00`
   < `$0.00`; `B-9` < `B-12`; a fragment `[badge, "Sep 12, 2026"]` reads the
   date; `null` last.
   Accept: vitest green. Depends on: none. Parallel with 1.

3. **Saved sort** — same file, `readSavedSort(key)` / `saveSort(key, sorting)`.
   Test first: `tests/table-sort.test.ts`. Types: TanStack `SortingState`.
   Storage key `mgr-sort:<pathname>:<header texts joined by |>`, so two tables
   with the same headers on one page share a sort. Reads and writes are wrapped
   in `try`/`catch`. A failure means no saved sort (private window, blocked
   storage), which is safe because the table still draws in its default order.
   A malformed or unknown-column value is ignored.
   Accept: vitest green with a stubbed `localStorage`, including a throwing one.
   Depends on: 2.

4. **`SortHead`** — new `components/mgr/sort-head.tsx` (client). It's the header
   button: the label, an arrow (lucide `ArrowUp`/`ArrowDown`/`ArrowUpDown`),
   and `aria-sort` on the `TableHead`. Clicks cycle ascending, descending, then
   the default order. Used by both tables below.
   Test first: `tests/record-table.test.ts` (static render: a sortable header
   renders a button with `aria-sort="none"`; an sr-only action header does not).
   Accept: vitest green. Depends on: 1.

5. **`RecordTable` sorts** — `components/mgr/views/record-table.tsx` gains
   `"use client"`, `useReactTable` with `getSortedRowModel`, columns built from
   `headers` with `sortingFn` → `compareSortValues`, and the saved sort from
   task 3 (read in an effect after mount, written on change). The phone list
   draws the same sorted rows. New props: `RecordTableRow.sort?: SortValue[]`;
   `sortable?: boolean` (default true).
   Test first: `tests/record-table.test.ts`. The static render keeps the
   default row order and draws each header as a button. Task 2's pure tests
   cover the ordering itself.
   Accept: vitest green; existing record-table and table-alignment tests still
   pass. Depends on: 3, 4.

6. **`E.tbl` sorts** — `components/mgr/e.tsx` `tbl` renders a new client
   `components/mgr/sort-table.tsx` (same hook and `SortHead`), with a fourth
   argument `{ sortable?: false }`. Keeps `shrink-0` and `min-w-max` (#1037).
   Test first: `tests/table-alignment.test.ts` (alignment unchanged with
   sortable headers) and `tests/record-table.test.ts` style static render.
   Accept: vitest green. Depends on: 3, 4. Parallel with 5.

7. **Explicit sort values where a cell is a component.** Pass `sort` for
   Finished goods Available (`row.atp`), Batches vessel/readings (vessel name),
   Invoices Total (`row.total.value`) and Due (`row.due.value`), and Orders
   Status (`row.status`). Files: `components/mgr/views/finished-goods.tsx`,
   `batches.tsx`, `invoices.tsx`, `orders-list.tsx`.
   Test first: `tests/record-table.test.ts` (a row whose cell is a component
   and whose `sort` is given renders without warnings; `cellSortValue` of a
   component cell is `null`).
   Accept: vitest green. Depends on: 5.

8. **Exclusions.** `sortable: false` on monthly compliance's two tables and the
   price-group grid (`monthly-compliance.tsx`, `price-groups.tsx`).
   Test first: `tests/table-alignment.test.ts` (an `E.tbl` with
   `{ sortable: false }` renders plain header text, no button).
   Accept: vitest green. Depends on: 6.

9. **Look at it.** Browse proof on the test stack (`.agents/skills/browse`):
   click each register's headers, reload, see the sort kept; desktop and phone
   screenshots in a PR comment. Depends on: 7, 8.

10. **Docs.** `content/docs/staff-guide.mdx`: one paragraph on sorting a table
    and that the last sort is remembered on that browser, and that Orders and
    Invoices sort the page shown. Update `record-table.tsx`'s module comment,
    `e.tsx`'s `tbl` doc, and the `list-filters.md` TanStack row (point here).
    Test: `tests/docs.test.ts`, `tests/design-docs.test.ts`.
    Depends on: 5, 6.

## Parallelism

- 1 and 2 run in parallel; 3 follows 2.
- 4 follows 1. 5 and 6 run in parallel after 3 and 4.
- 7 follows 5; 8 follows 6. 9 and 10 come last.

No database changes and no new commands, so no migration and no API docs.

## Out of scope

Multi-column sort, server-side sort for the paged lists, column filters or
hiding, a phone sort control, and converting `E.nav` lists to tables.
