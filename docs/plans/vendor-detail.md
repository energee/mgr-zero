# Vendor detail page (#1586)

Status: Phase 1 plan, awaiting owner approval. No implementation code yet.
Implementation runs on a new branch from `main` after approval; this PR adds
only this file.

Source: issue #1586 (split from #1516 item 5). Owner decision 2026-10-28:
an M feature with its own plan, a new screen record, a route, and reads for
the vendor's contracts, open purchase orders and materials. Line numbers are
from `origin/main` c5444952e and may move a little.

## Goal

A vendor row on **Vendors** opens `/vendors/<id>`. That page shows:

- the vendor's facts;
- its contracts, each with the four remaining-commitment numbers;
- its open purchase orders;
- the materials whose default vendor it is.

**Edit** opens the existing Edit vendor sheet from that page. **Deactivate
vendor** is already inside that sheet, so it stays reachable there.

## Assumptions to confirm at approval

The issue can be read more than one way on these points. Each row says what
this plan does. Approving the plan approves these choices.

| # | Question | This plan does |
| --- | --- | --- |
| A | Does the Vendors list keep **Edit** on each row? | Yes. The list keeps **Edit**, and the vendor page adds it too. Both mount the same `VendorForm`. |
| B | Is **Deactivate vendor** its own button on the page? | No. It stays inside the Edit vendor sheet, where `VendorView` draws it now. |
| C | Can contracts be edited from the vendor page? | No. The page lists them read-only. Add and Edit contract stay in the Contracts list on `/vendors`, which is unchanged. |
| D | Does the materials section include inactive materials? | Yes, marked **Inactive**, as Materials on hand shows them. |
| E | Does the page offer closed purchase orders? | No. It lists open orders only: draft, sent and partially received. |

One rule follows from existing roles and is not a choice. `list_purchase_orders`
admits only Admin and Warehouse (`PO_ROLES`, `purchasing.ts:19`). Brewer can open
Vendors, so for Brewer the page leaves out the open purchase orders section. It
does not show an empty one.

## Existing owners and reuse

Owner: `lib/commands/purchasing.ts` (`.agents/ARCHITECTURE.md` row 14).

| Need | Reused | Change |
| --- | --- | --- |
| Vendor facts and contracts with their four numbers | `list_vendors_and_contracts` (`purchasing.ts:117`) | Add a `vendorId` input |
| Open purchase orders | `list_purchase_orders` (`purchasing.ts:273`) | Add a `vendorId` input |
| Materials whose default vendor it is | `list_materials` (`purchasing.ts:155`) | Add a `defaultVendorId` input |
| Status, typed and observed lead time text | `toRow` in `lib/mgr/vendors-view.ts:51` | Export it as `toVendorsRow` |
| Contract row text | The title and detail strings built in `app/(app)/vendors/page.tsx:68-74` | Move them to `contractRowView` in `lib/mgr/contracts-view.ts` |
| PO number, status and next action | `poNo` (`lib/mgr/doc-no.ts`), `poListStatus` and `purchaseOrderNext` (`lib/mgr/purchase-orders-view.ts`) | None |
| PO rows | The row loop in `components/mgr/views/purchase-orders.tsx:27-35` | Extract it as `PurchaseOrderRows` |
| Contract rows | `ContractsView` (`components/mgr/views/contracts.tsx`) | Draw `E.act` only for a row with a verb |
| Edit sheet | `VendorForm` (`app/(app)/vendors/vendor-form.tsx`) | None |
| Terms label | `paymentTermLabel` (`lib/mgr/labels.ts:31`) | None |
| Request-cached record read for page and metadata | `customers/customer-data.ts` and `locations/location-data.ts` | New sibling `vendors/vendor-data.ts` |
| Live-only row links | `linkRows` on `CustomersView` and `PurchaseOrdersView` | Same prop on `VendorsView` |

Every filter is an input on the registered query, and Postgres applies it
(AGENTS.md Negative 12). The page never narrows a list it fetched.

## Database

No migration. Each filter is an equality on a column the read already
selects from:

- `vendors.id`
- `material_contracts.vendor_id`
- `contract_balances.vendor_id` (`00001_baseline.sql:2289`)
- `vendor_lead_times.vendor_id`
- `purchase_orders.vendor_id`
- `materials.default_vendor_id`

`po_open_balances` has no `vendor_id`. `list_purchase_orders` keeps its current
brewery-wide `po_open_balances` read, so the vendor filter adds no round trip.

## Out of scope

- A **New PO** link with the vendor already chosen.
- Material detail pages. Material rows on the vendor page stay plain text, as
  on Materials on hand.
- The separate privacy refresh owns fixture-name sanitation.
  This feature extends `vendorsList` so the Vendors → Vendor detail tap stays
  consistent with the existing fictional data.
- Moving the Contracts list off `/vendors`.

## Files touched

| File | Tasks |
| --- | --- |
| `lib/commands/purchasing.ts` | 1, 2, 3 |
| `tests/purchasing.test.ts` | 1, 2, 3 |
| `content/docs/api/purchasing.mdx`, `content/docs/api/index.mdx` (generated) | 4 |
| `lib/mgr/contracts-view.ts`, `components/mgr/views/contracts.tsx` | 5 |
| `lib/mgr/vendors-view.ts`, `components/mgr/views/vendors.tsx` | 6 |
| `app/(app)/vendors/page.tsx` | 5, 6 |
| `components/mgr/views/purchase-orders.tsx` | 7 |
| `tests/purchasing-view.test.ts` | 5, 6, 7, 9 |
| `lib/mgr/vendor-detail-view.ts` (new), `tests/vendor-detail-view.test.ts` (new) | 8 |
| `components/mgr/views/vendor-detail.tsx` (new), `components/mgr/screens.tsx`, `lib/mgr/fixtures/purchasing.ts`, `lib/mgr/screen-routes.ts` | 9 |
| `app/(app)/vendors/vendor-data.ts` (new), `app/(app)/vendors/[id]/page.tsx` (new) | 10 |
| `tests/record-page-titles.test.ts`, `tests/vendor-detail-page.test.ts` (new) | 10 |
| `lib/commands/search.ts`, `tests/search.test.ts` | 11 |
| `content/docs/staff-guide.mdx` | 12 |

Open PR #1601 (#1584 purchasing follow-ups) also edits `purchasing.ts`,
`screens.tsx`, `fixtures/purchasing.ts`, `screen-routes.ts`,
`staff-guide.mdx` and `purchasing-view.test.ts`. It also adds the dynamic route
`purchase-orders/[id]/edit`, which changes the `RECORDS` list in
`tests/record-page-titles.test.ts`. Start from `main` after #1601 lands, or
expect conflicts in those files.

## Tasks

Each task names its test first and starts by watching it fail. UI rendering
is the exception: TDD the logic below the component, then look at the page
with `/browse`. A task that changes a type or prop updates every caller in the
same task, so `bunx tsc --noEmit` passes after each one.

Dependencies are in each task's **Needs** line. Tasks 1-3 share one file, so
they run in order. Waves:

- Wave 1: 1, 5, 7.
- Wave 2: 2, 6.
- Wave 3: 3, 8.
- Wave 4: 4, 9.
- Wave 5: 10.
- Wave 6: 11.
- Wave 7: 12.
- Wave 8: 13.

1. **`list_vendors_and_contracts` takes `vendorId`.** Needs: none.
   - Test first: `tests/purchasing.test.ts` (database-backed). Set up two vendors, each with a contract and a received PO.
     - `{ vendorId: a }` returns only vendor `a`, with only `a`'s contracts and observed lead times.
     - An unknown UUID returns `[]`.
     - A non-UUID is rejected with `invalid_input`.
   - Input: `vendorId: z.string().uuid().optional().describe("Only this vendor")`. When it is set, add `.eq("id", vendorId)` to the vendors read and `.eq("vendor_id", vendorId)` to the `material_contracts`, `contract_balances` and `vendor_lead_times` reads.
   - Update the description string and the comment above the query.
   - Accept: the vitest file is green and `tsc --noEmit` is clean.

2. **`list_purchase_orders` takes `vendorId`.** Needs: 1 (same file).
   - Test first: `tests/purchasing.test.ts`. Set up two vendors with one draft each and one received PO for vendor `a`.
     - `{ vendorId: a }` returns only `a`'s draft.
     - `{ vendorId: a, includeClosed: true }` adds `a`'s received PO.
     - Brewer is still refused with `permission_denied`.
   - Input: `vendorId: z.string().uuid().optional().describe("Only this vendor's orders")`. Add `.eq("vendor_id", vendorId)` to the `purchase_orders` read. The `po_open_balances` read is unchanged (see Database).
   - Accept: vitest and tsc.

3. **`list_materials` takes `defaultVendorId`.** Needs: 2 (same file).
   - Test first: `tests/purchasing.test.ts`.
     - Only materials whose `default_vendor_id` matches come back.
     - With `includeInactive: true`, an inactive one comes back too.
     - The filter combines with `q`.
   - Input: `defaultVendorId: z.string().uuid().optional().describe("Only materials whose default vendor is this one")`. The name matches `upsert_material`'s `defaultVendorId`. Add `.eq("default_vendor_id", …)`.
   - Accept: vitest and tsc.

4. **HTTP API reference.** Needs: 3.
   - Test first: run `tests/api-docs.test.ts`. It fails on the three changed inputs.
   - Run `bun run docs:api` to regenerate `content/docs/api/`. Do not hand-edit the generated pages.
   - Accept: `bunx vitest run tests/api-docs.test.ts` is green.

5. **One contract row helper; a row without a verb.** Needs: none.
   - Test first: `tests/purchasing-view.test.ts`.
     - `contractRowView(c, vendorName)` gives the current `/vendors` title `"<vendor> · <contract no or material>"` and the detail `"<n> committed · <n> received · <n> on order · <n> available"`.
     - Without `vendorName`, the title is the contract number or material only.
     - `warning` is set when available ≤ 0.
     - `ContractsView` draws no **Edit** for a row with no `verb`.
   - In `lib/mgr/contracts-view.ts`:
     - `ContractsRowView.verb` becomes optional.
     - Add `contractRowView(c: { id: string; contract_no: string | null; material_name: string | null; qty_committed: number; qty_received: number; qty_on_order: number; qty_available: number }, vendorName?: string): ContractsRowView`. It sets `verb: "Edit"` only when `vendorName` is given, because only the Vendors list mounts `ContractForm`.
   - In `ContractsView`, the fallback becomes `rowTrailing?.(row) ?? (row.verb ? E.act(row.verb) : null)`.
   - `app/(app)/vendors/page.tsx` calls `contractRowView(c, v.name)` instead of building the strings inline. Its output is unchanged.
   - Reuse: `fmtVendorQty` from `vendors-view.ts`.
   - Accept: vitest and tsc. `tests/contract-units.test.ts` stays green.

6. **Vendors list rows open the vendor page.** Needs: 5 (both edit `vendors/page.tsx`).
   - Test first: `tests/purchasing-view.test.ts`. Replace the "no vendor page yet" case at :534-540 with these:
     - Inventory names are inert taps with `data-to="Vendor detail"`.
     - With `linkRows`, each name links to `/vendors/<key>`.
     - **Edit** is still on every row (assumption A).
   - In `lib/mgr/vendors-view.ts`:
     - Export `toRow` as `toVendorsRow`.
     - Add `href: string` (`/vendors/${key}`) to `VendorsRowView`. This follows `customers-view.ts:62`.
   - In `components/mgr/views/vendors.tsx`:
     - Add a `linkRows?: boolean` prop.
     - Each row gets `href: linkRows ? row.href : undefined` and `to: "Vendor detail"`.
     - Update the module comment, which says there is no vendor page.
   - `app/(app)/vendors/page.tsx` passes `linkRows`.
   - Accept: vitest and tsc. `tests/navigation-consistency.test.ts`, `tests/record-lifecycle-view.test.ts` and `tests/main214-page-assembly.test.ts` stay green.

7. **Shared PO rows.** Needs: none.
   - Test first: `tests/purchasing-view.test.ts`. `PurchaseOrderRows` with a draft row draws the **Mark sent** act. A received row draws a plain nav. `linkRows` sets each href.
   - Export `PurchaseOrderRows({ rows, linkRows }: { rows: PurchaseOrdersRowView[]; linkRows?: boolean })` from `components/mgr/views/purchase-orders.tsx`. It holds the existing loop at :27-35, and `PurchaseOrdersView` calls it.
   - Reuse: this moves the existing loop. It is not a second copy.
   - Accept: vitest and tsc. The Purchase orders record in `tests/mgr-screens.test.ts` renders unchanged.

8. **Vendor detail view model.** Needs: 5, 6.
   - Test first: `tests/vendor-detail-view.test.ts` (new, pure). Cases:
     - Facts in this order: Status, Email, Phone, Terms, Lead time, Observed lead time. A null email or phone is left out.
     - Terms reads `Net 30`.
     - Observed lead time with no received order reads `No received orders yet`.
     - Contract rows come from `contractRowView` without a vendor name.
     - PO rows have the title `poNo(po_no)`, the detail `poListStatus`, the verb from `purchaseOrderNext`, and the href `/purchase-orders/<id>`.
     - `purchaseOrders: null` gives `purchaseOrders: null` in the model. This is the Brewer case.
     - Material rows have the detail `"<Type> · <purchase unit>"` with `· Inactive` added for an inactive one.
     - Each empty section has its empty state.
   - New `lib/mgr/vendor-detail-view.ts` with a module comment:
     - `VendorDetailSnapshot = { backHref?: string; vendor: VendorRecord; purchaseOrders: VendorPo[] | null; materials: VendorMaterial[] }`.
     - `VendorRecord` is one `list_vendors_and_contracts` row: the `VendorsVendor` fields plus `email`, `phone`, `payment_terms` and the contract balances.
     - `VendorPo` is the fields of one `list_purchase_orders` row that `poListStatus` needs.
     - `VendorMaterial = { id; name; category; purchase_uom; active }`.
     - `VendorDetailViewModel = { backHref?: string; title: string; facts: [string, string][]; contracts: ContractsViewModel; purchaseOrders: { rows: PurchaseOrdersRowView[]; empty?: EmptyState } | null; materials: { rows: { key: string; title: string; detail: string }[]; empty?: EmptyState } }`.
     - `toVendorDetailViewProps(s: VendorDetailSnapshot): VendorDetailViewModel`.
   - Reuse: `toVendorsRow` (task 6) for status and lead times, and `paymentTermLabel`, `contractRowView`, `poNo`, `poListStatus`, `purchaseOrderNext` and `sentenceCase`. Contract empty states come from `toContractsViewProps`.
   - Accept: vitest and tsc.

9. **Shared view and inventory record.** Needs: 7, 8.
   - Test first: `tests/purchasing-view.test.ts`.
     - `screen("Vendor detail").body` is a `VendorDetailView` whose model equals `toVendorDetailViewProps(vendorDetailYch)`.
     - The rendered HTML has the headings Contracts, Open purchase orders and Default materials, the four contract numbers, and a `PO-` row.
     - A model with `purchaseOrders: null` has no Open purchase orders heading.
   - New `components/mgr/views/vendor-detail.tsx` with a module comment. Props: `{ model; editAction?: ReactNode; linkRows?: boolean }`. It draws:
     - `E.back("Vendors", model.title, editAction ?? E.btn("Edit"), model.backHref)`;
     - one `E.fld` per fact;
     - `ContractsView` with `header={E.group("Contracts")}`;
     - when `purchaseOrders` is not null, `E.group("Open purchase orders")` and then `PurchaseOrderRows` or `E.blank`;
     - `E.group("Default materials")` and then one `E.row` per material, or `E.blank`.
   - In `lib/mgr/fixtures/purchasing.ts`, add `vendorDetailYch: VendorDetailSnapshot`. It builds on `vendorsList.rows[0]` and has one contract, one sent PO and two materials.
   - In `components/mgr/screens.tsx`, add a "Vendor detail" record after "Vendors" (step 7, slice 2, tab More):
     - `to: { Edit: "Vendor" }`
     - `reads: "list_vendors_and_contracts [vendorId] · list_purchase_orders [vendorId; admin or warehouse] · list_materials [defaultVendorId, inactive included]"`
     - `writes: "upsert_vendor [on Vendor]"`
     - `states`: permission (warehouse or brewer), brewer (no open purchase orders section), inactive, no contracts, no open orders, no default materials.
     - A `spec` sentence for each assumption A-E above.
   - In `lib/mgr/screen-routes.ts`, add `{ name: "Vendor detail", file: "app/(app)/vendors/[id]/page.tsx" }`. Write the test before the route exists, and expect `tests/app-screen-parity.test.ts` to fail until task 10.
   - Accept: vitest, tsc and lint, plus the AGENTS.md screen list: `tests/mgr-screens.test.ts`, `tests/tap-coverage.test.ts`, `tests/screen-links.test.ts`, `tests/theme-contrast.test.ts`, `tests/screen-persona.test.ts`, `tests/design-docs.test.ts` and `tests/docs.test.ts`. If a material row name counts as a tap that lands nowhere, give it `to: "Materials on hand"`.

10. **Live route.** Needs: 3, 9.
    - Test first:
      - `tests/record-page-titles.test.ts`: add `["vendors/[id]", "id", "list_vendors_and_contracts"]` to `RECORDS`, and add `vendors/vendor-data.ts` to the loaded data files. A missing vendor 404s in metadata and render.
      - `tests/vendor-detail-page.test.ts` (new): mock `runPageQuery` the way `tests/main214-page-assembly.test.ts` does. Check that:
        - the page asks `list_vendors_and_contracts` for `{ vendorId }`;
        - it asks `list_materials` for `{ defaultVendorId, includeInactive: true }`;
        - it asks `list_purchase_orders` for `{ vendorId }` only when `canRun` allows it;
        - a Brewer context makes no `list_purchase_orders` call;
        - the page mounts `VendorDetailView` with `linkRows` and a `VendorForm` edit action.
    - New `app/(app)/vendors/vendor-data.ts` with a module comment. It is a `cache`d `getVendorPageData(id)`: `isUuid` or `notFound()`, then `list_vendors_and_contracts({ vendorId })`, then `notFound()` when that returns no row.
    - New `app/(app)/vendors/[id]/page.tsx` with a module comment:
      - `generateMetadata` awaits `getVendorPageData` and returns `navTitle("/vendors")`.
      - The page reads POs (role-gated) and materials in parallel, then renders `VendorDetailView` with `editAction={<VendorForm vendor={vendor} />}`.
    - `tests/nav-page-roles.test.ts` needs no new entry. `/vendors` already lists `list_vendors_and_contracts` and `list_materials`, and the PO read is role-gated.
    - Accept: vitest and tsc. `tests/app-screen-parity.test.ts` and `tests/screen-view-composition.test.ts` are green.

11. **Search opens the vendor page.** Needs: 10.
    - Test first: in `tests/search.test.ts:118`, the vendor hit's href becomes `` `/vendors/${vendor.id}` ``. This needs the vendor row's id from the test setup.
    - In `lib/commands/search.ts:141`, change the hit to `` `/vendors/${r.id}` ``, and change the `PAGE_READS` comment at :49 to `/vendors/[id]`.
    - In `components/mgr/screens.tsx:492`, the search record's example "a kind with no detail page, such as a vendor" becomes "such as a material".
    - Accept: vitest and tsc. `tests/search.test.ts` is database-backed.

12. **Staff guide.** Needs: 9, 10, 11.
    - Test first: none, because this is prose. `tests/docs.test.ts`, `tests/design-docs.test.ts` and `tests/screen-embed.test.ts` stay green.
    - In `content/docs/staff-guide.mdx`, under "Vendors and contracts" (~1192):
      - Add `<Screen name="Vendor detail" />`.
      - Selecting a vendor's name opens its page. The page shows its facts, its contracts with the four numbers, its open purchase orders (Admin and Warehouse only) and its default materials (inactive ones marked).
      - **Edit** works from the page as well as the list. **Deactivate vendor** is in its Edit sheet.
    - In the Search paragraph (~61), vendors now open their own page. Remove "Vendors" from the list of kinds that open their list page.
    - Accept: the doc tests and lint.

13. **Prove, simplify, review, PR.** Needs: 1-12.
    - Run `bun run test`, `bunx tsc --noEmit` and `bun run lint` as separate steps, and gate on each exit code.
    - Run `/simplify`, then re-prove. Give the simplify diff to a read-only agent and ask what behavior it changed. Run the Haiku what/why check on every changed function (Negative 3).
    - Use `/browse` on the test stack, at desktop and phone width, with Admin and Brewer, and post the screenshots in a PR comment:
      - `/vendors`, where a name opens the page;
      - `/vendors/<id>`, as Admin and as Brewer, the Brewer view having no open purchase orders section;
      - Edit, then Deactivate vendor, from the page.
    - The PR body says `Closes #1586` and names this plan.
    - Accept: CI is green.
