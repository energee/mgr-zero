# List filters and sort: search, sort and filter in the URL, applied by the query

Status: approved 2026-10-14 (user: "use shadcn components" — search is `E.search` (shadcn `Input`), sort and category are shadcn `Tabs` via the shared `TabBar` (`E.tabs`)). Branch `feat/list-filters`, PR to `main`.

Update (#965): Sort and Category are now labeled selects (`ScopePick`, `components/mgr/scope-pick.tsx`) whose options are links, built by `toCatalogScopes` in `lib/mgr/catalog-view.ts`. `ListControls` takes them as `scopes`; its tab rows are gone. The URL is still the state.

## Why

Catalog lists every brand A–Z with no way to narrow or reorder it. No list
screen has search or sort. `E.search` draws a box with no name, value or
handler (`components/mgr/e.tsx:459`), so Customers passes `search={null}`.

A list screen already filters one way. Orders reads `?status=` and passes it
to `list_orders`, and Customers passes `?missingEmail=1` to `list_customers`.
`LinkTabs` (`components/mgr/work-tabs.tsx`) draws filter tabs as links. This
plan adds search and sort the same way, so every later list reuses it.

## Decisions

| Question | Answer |
|---|---|
| Where is the state? | The URL (`?q=&sort=&category=`). Links can be shared, Back works, and the server re-renders. There is no client state. |
| Who filters and sorts? | Postgres, through new optional inputs on the registered query (`.agents/ARCHITECTURE.md` Pre-implementation gates). The page never narrows rows. |
| TanStack Table? | No, for search and filter. Column-header sorting later adopted it (`docs/plans/data-table-sort.md`, 2026-10-22). |
| Generic filter language? | No. Each list command declares its own few inputs. The shared parts are the URL parser and the control strip. |
| Search semantics | Case-insensitive *contains* on name and alias (`ilike %q%`), escaped with the existing `escapeLike` (`lib/commands/search.ts:40`), which moves to a shared module. |
| Scope of this PR | Catalog brands only. Customers and Materials adopt it in their own PRs. |

## Shared pieces

1. **`lib/mgr/list-params.ts`** — `listParams(schema, raw)`: a zod object
   whose fields all have `.catch(default)`, so one bad param falls back to its
   default instead of failing the page. It returns typed params plus
   `queryWith(patch)`, the current params with one change and defaults left
   out, and `hrefWith(path, patch)`, that query as a link (a sort tab keeps
   `q`; clearing a filter keeps `sort`).
2. **`E.search`** gains optional `name` and `defaultValue`. With a name it
   renders inside a plain `<form method="get">` (Enter submits). It is still the
   same E control, and the screen record calls it unchanged.
3. **`components/mgr/list-controls.tsx`** — `ListControls({ search, sorts,
   filters })`: the `E.search` form, then sort and filter as `TabBar` rows (`E.tabs`'s shadcn Tabs; hrefs make each tab a link)
   built with `hrefWith`. Hidden inputs carry the other params (`queryWith({ q: "" })`),
   so a search keeps the sort.

## Catalog adoption

`list_brands` input becomes
`{ q?: string; sort?: "name" | "abv" | "newest"; category?: string }`, all
optional, so the eight other callers (recipes, batches, packaging, brand pages,
search) are unchanged.

- `q`: `.or("name.ilike.%q%,alias.ilike.%q%")`, escaped.
- `sort`: `name` → `order("name")`; `abv` → `order("abv", { ascending: false, nullsFirst: false }).order("name")`;
  `newest` → `order("created_at", { ascending: false })`.
- `category`: `.eq("category", category)` (indexed: `brands_category_idx`).
  The tabs come from `list_catalog_categories`, which already exists.

The view model gets `filtered: boolean`, so an empty result says "No brands
match" with a Clear link instead of "No brands yet".

## Tasks

Each task starts by writing its failing test. 1–3 can run in parallel; 4
needs 1–3; 5 needs 4.

1. **Move `escapeLike`** to `lib/escape-like.ts` and import it in `lib/commands/search.ts`.
   Test: `tests/escape-like.test.ts` (`%`, `_` and `\` are escaped). Accept: vitest green; `search.test.ts` still green.
2. **`listParams` + `hrefWith`** in `lib/mgr/list-params.ts`.
   Test: `tests/list-params.test.ts` (defaults, a bad enum falls back, an array param takes the first value, `hrefWith` drops defaults and empty values, order is stable). Accept: vitest, tsc.
3. **`list_brands` inputs** in `lib/commands/catalog.ts`.
   Test: add cases to `tests/commands-catalog.test.ts` (DB-backed): q matches name and alias and escapes `%`; each sort orders rows; category narrows; empty input matches today's output. Accept: vitest on `mgr_test`; `bun run docs:api` regenerates `content/docs/api/catalog.mdx`.
4. **`E.search` name/defaultValue, `ListControls`, and the Catalog page.**
   `components/mgr/e.tsx`, `components/mgr/list-controls.tsx`, `lib/mgr/catalog-view.ts` (`filtered` and the empty copy), `components/mgr/views/catalog.tsx` (a `controls` slot above the rows), `app/(app)/catalog/page.tsx` (reads `searchParams` via `listParams`, passes them to `list_brands`), and the Catalog record in `components/mgr/screens.tsx`, which draws the controls with fixture state.
   Test: add cases to `tests/catalog-view.test.ts` (the filtered empty state) and the screen-only proof list. Rendering is checked visually with `/browse`.
5. **Docs.** `content/docs/staff-guide.mdx` Catalog section (search, sort, category), module comments on the new files, and the PR description (`TODO:` line if one matches).

## Out of scope

Customers, Materials and other lists; saved views; multi-column sort;
pagination on Catalog (it is under the row cap).
