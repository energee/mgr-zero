# QuickBooks vendor Bill from a purchase receipt (#870)

Status: plan, awaiting owner approval. No implementation code until the
decisions below are signed off. Implementation branch:
`feat/870-qbo-vendor-bill`, PR to `main`.

## Why

Purchasing never reaches QuickBooks. Vendor bills are keyed in by hand,
separately from the PO and receipt MGR already records. The payable is the
Bill, so MGR posts a Bill from a counted receipt. MGR never pushes the PO: a
QuickBooks Purchase Order does not touch the books.

## What exists (searched 2026-10-14)

| Piece | Where | Reuse |
| --- | --- | --- |
| Vendor Bill code | none. `grep -rni bill lib supabase/migrations \| grep -i qbo` finds only customer `BillAddr` fields (`lib/qbo.ts:35`, `20261012100000_qbo_customer_data.sql`) | build new |
| `vendors.qbo_vendor_id` | `00001_baseline.sql:284`; read only by `database.generated.ts` | **yes**: the vendor mapping column |
| Durable outbound push | `start_qbo_push` / `finish_qbo_push` (`20260910120847_deploy_current_schema.sql:1460`, `:1044`), `pushInvoiceToQbo` (`lib/qbo.ts:297`), `finishQboPush` (`lib/supabase/integration-tokens.ts:608`) | **yes**: same start → POST → finish shape |
| Transaction POST | `QboOAuthClient.createTransaction` (`lib/qbo.ts:595`), typed `"Invoice" \| "CreditMemo"` | **yes**: widen the entity type |
| Exact-ID mapping RPCs | `set_qbo_customer_mapping`, `set_qbo_item_mapping` (`20260910120847_deploy_current_schema.sql:1358`, `:1406`) | **yes**: copy the shape for vendors |
| Mapping screen | `app/(app)/settings/accounting/mappings/page.tsx`, `QboMappingForm` (`qbo-controls.tsx`), `QboMappingsView` (`components/mgr/views/qbo-mapping.tsx`) | **yes**: add two sections and two kinds |
| Frozen receipt cost | `receipt_lines.purchase_unit_cost_cents`, `purchase_uom`, `material_name`, `material_id` (`20260928110000_receipt_corrections.sql:14`) | **yes**: the Bill line source |
| Receipt corrections | `correct_purchase_receipt` (latest: `20261012101500_purchase_order_closure.sql:69`); a correction appends a receipt with `corrects_receipt_id` | **yes**: decides which receipt may post |
| Material kind | `material_category` enum (`00001_baseline.sql:97`): malt, hop, yeast, adjunct, chemical, packaging, other | **yes**: the account mapping key |
| v1 | `~/Repos/mgr/supabase/migrations/00099_quickbooks_integration.sql:23` names `'Bill'` as an entity type only; no Bill push was built | nothing to port |

No open PR or branch covers #870 (`gh pr list --search 870` is empty).

## Decisions needed (awaiting owner approval)

Each one has a recommended default. The default is the simplest option that
meets the issue's acceptance. Say which to change.

1. **Vendor mapping.**
   - RECOMMENDED: exact QuickBooks vendor ID, like customers today. Admin types
     the ID on Settings → Accounting → QuickBooks mappings. MGR never matches
     by name. A new `vendors.qbo_realm_id` ties the ID to the company it was
     verified in.
   - Alternative: a picker that lists QuickBooks vendors. It needs a vendor
     read and a snapshot table, like the customer reconciliation design.
2. **Cost source.**
   - RECOMMENDED: the receipt's frozen `purchase_unit_cost_cents` (the PO line
     price at receipt time). Line amount is `qty_counted × unit cost`, rounded
     to the cent. A receipt line with no cost blocks the post. The message says
     to enter that bill in QuickBooks by hand.
   - Alternative: a vendor-invoice amount typed at receipt. It needs new
     receipt columns and a change to the receive and correct forms.
3. **Account mapping.**
   - RECOMMENDED: one QuickBooks account ID per material category, per
     company. Bill lines use `AccountBasedExpenseLineDetail` with that account.
     The admin picks an expense or inventory-asset account per category.
   - Alternative: one QuickBooks item per material, using
     `ItemBasedExpenseLineDetail`. That doubles inventory if QuickBooks also
     tracks quantity, and needs a mapping per material.
4. **Granularity.**
   - RECOMMENDED: one Bill per receipt. The database allows at most one
     pending or posted Bill per receipt.
   - Alternative: one Bill per vendor invoice that groups several receipts.
     It needs a vendor-invoice record that MGR does not have.
5. **Corrections.**
   - RECOMMENDED: mirror the stock correction. A superseded receipt can no
     longer post a Bill. If its Bill was already posted, Admin posts a
     **VendorCredit** for that Bill's exact frozen lines. The replacement
     receipt then posts its own Bill. MGR never edits a posted Bill.
   - Alternative: a sparse update of the posted Bill. QuickBooks may already
     show it paid or edited, and MGR would need its SyncToken.
6. **Payment.**
   - RECOMMENDED: bill payment stays in QuickBooks. MGR shows only its own
     post status. No bill sync.
   - Alternative: read bill balances back, like `sync_qbo_payments`. That is a
     second sync batch and a new screen state.
7. **Who posts** (not in the issue; needed to build).
   - RECOMMENDED: Admin posts and maps. Admin and Warehouse see the post
     status on the receipt. The token boundary already admits Admin.
   - Alternative: Warehouse also posts. That widens
     `requireIntegrationRole` beyond admin and sales.

Fixed by the pattern, not a choice: `TxnDate` is the receipt's
`received_on`. `PrivateNote` reads `MGR PO <po_no> receipt <received_on>`.
`DocNumber` and `DueDate` are omitted, so QuickBooks applies the vendor's own
terms. MGR has no vendor invoice number to send.

## Schema — `20261014130000_qbo_vendor_bills.sql`

The name sorts after the latest file, `20261014120000_price_group_barcodes.sql`.
If `main` moves first, rename to the then-latest timestamp before
`bun run migrations:lock`.

```sql
-- QuickBooks vendor Bills from purchase receipts (#870).
-- Vendor mapping is exact-ID and realm-bound, like customers.
alter table public.vendors add column qbo_realm_id text;

-- One QuickBooks account per material category per company.
create table public.qbo_category_accounts (
  brewery_id uuid not null references public.breweries(id),
  realm_id text not null,
  category public.material_category not null,
  qbo_account_id text not null check (btrim(qbo_account_id) <> ''),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (brewery_id, realm_id, category)
);
alter table public.qbo_category_accounts enable row level security;
create policy staff_read on public.qbo_category_accounts for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin']::public.staff_role[])));
revoke all on public.qbo_category_accounts from public, anon, authenticated, service_role;
grant select on public.qbo_category_accounts to authenticated;

-- One row per outbound attempt; the frozen body and request id are written
-- before the POST, exactly like qbo_pushes for invoices.
create table public.qbo_bill_pushes (
  id uuid primary key default private.new_uuid(),
  brewery_id uuid not null references public.breweries(id),
  receipt_id uuid not null,
  connection_id uuid not null,
  realm_id text not null,
  entity_type text not null check (entity_type in ('Bill','VendorCredit')),
  provider_request_id uuid not null unique,
  finish_request_id uuid not null unique default private.new_uuid(),
  request_body text not null,
  local_snapshot jsonb not null,
  attempt_reason text not null check (attempt_reason in ('initial','corrected')),
  supersedes_push_id uuid,
  status public.qbo_sync_status not null default 'pending',
  qbo_entity_id text,
  response jsonb,
  error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, brewery_id),
  foreign key (receipt_id, brewery_id) references public.receipts(id, brewery_id),
  foreign key (supersedes_push_id, brewery_id) references public.qbo_bill_pushes(id, brewery_id)
);
create index qbo_bill_pushes_receipt_idx on public.qbo_bill_pushes (brewery_id, receipt_id, created_at desc);
-- The acceptance guarantee: one live Bill (and one VendorCredit) per receipt.
create unique index qbo_bill_pushes_one_live on public.qbo_bill_pushes (receipt_id, entity_type)
  where status in ('pending','pushed');
alter table public.qbo_bill_pushes enable row level security;
create policy staff_read on public.qbo_bill_pushes for select to authenticated
  using (brewery_id in (select public.my_staff_brewery_ids(array['admin','warehouse']::public.staff_role[])));
revoke all on public.qbo_bill_pushes from public, anon, authenticated, service_role;
grant select on public.qbo_bill_pushes to authenticated;
```

A realm change needs no purge-trigger edit. Every read compares
`vendors.qbo_realm_id` and `qbo_category_accounts.realm_id` to the current
connection's realm, as `start_qbo_push` does for customers.

### RPCs (same migration)

| RPC | Grant | Rule |
| --- | --- | --- |
| `set_qbo_vendor_mapping(p_brewery, p_vendor, p_qbo_vendor_id, p_request_id)` | authenticated | Admin only. Copies `set_qbo_customer_mapping`: needs a connected company, a non-blank trimmed ID, and writes `qbo_vendor_id` plus `qbo_realm_id`. |
| `set_qbo_category_account(p_brewery, p_category, p_qbo_account_id, p_request_id)` | authenticated | Admin only. Upserts the row for the current realm. |
| `start_qbo_bill_push(p_brewery, p_receipt, p_entity_type, p_new_attempt_reason, p_request_id)` | authenticated | Admin only. Steps below. |
| `finish_qbo_bill_push(p_brewery, p_push, p_actor, p_status, p_qbo_entity_id, p_error, p_response, p_request_id)` | service_role | Copies `finish_qbo_push`, minus the invoice update. |

`start_qbo_bill_push`, in order:

1. Claim the request. On replay, return the finished attempt.
2. Lock the connected company. None means "QuickBooks connection required".
3. Return a pending attempt for this receipt and type unchanged, if one exists.
   A changed connection raises MG409, as for invoices.
4. `Bill`: refuse a superseded receipt (one with a successor
   `corrects_receipt_id`). Say "open the latest receipt".
5. `VendorCredit`: require a superseded receipt whose Bill is `pushed`. Its
   lines copy that Bill's `local_snapshot` lines.
6. Refuse a repeat. A `pushed` row returns `alreadyPushed`. A `push_failed`
   row needs `corrected` after the mapping is fixed.
7. Block, with the fix named, on: vendor mapping missing for this realm
   ("Map the vendor in Settings → Accounting"); a category account missing
   ("Map <category> in Settings → Accounting"); a counted line with no cost
   ("Receipt line <material> has no unit cost; enter this bill in QuickBooks").
8. Skip zero-count lines. Refuse a receipt whose counted total is zero.
9. Build the body: `VendorRef`, `TxnDate`, `PrivateNote`, one
   `AccountBasedExpenseLineDetail` line per counted receipt line.
10. Insert the attempt with a new `provider_request_id`, then complete the
    request with the start payload.

## Command and transport

- `lib/commands/qbo.ts` registers `set_qbo_vendor_mapping`,
  `set_qbo_category_account`, `list_qbo_category_accounts` (a query), and
  `push_receipt_to_qbo` (`requiresConfirmation: true`, input
  `{ receiptId, entityType: "Bill" | "VendorCredit", newAttemptReason?: "corrected" }`).
- `lib/qbo.ts`: the token read, expired-token refresh, single 401 retry, and
  definitive-rejection branch move out of `pushInvoiceToQbo` into one
  `sendQboTransaction(ctx, start, client)`. `pushInvoiceToQbo` and the new
  `pushReceiptToQbo` both call it, so the retry rule has one owner.
- `lib/supabase/integration-tokens.ts` adds `finishQboBillPush`, beside
  `finishQboPush`.

## Tasks

Each task starts by writing its named failing test. "DB" tests need the
`mgr_test` stack (`scripts/test-db.sh`).

1. **Migration: schema and the two mapping RPCs.**
   - Files: `supabase/migrations/20261014130000_qbo_vendor_bills.sql`,
     `supabase/migrations.lock.json`, `lib/supabase/database.generated.ts`
     (`bun run types:database`).
   - Test first: `tests/qbo-bill-mapping.test.ts` (DB). A vendor maps to an
     exact trimmed ID in the current realm. A blank ID, a disconnected company
     and a warehouse caller are refused. Replay returns the first result. A
     category account saves per realm; a realm change hides it.
   - Also: add both RPCs to `tests/rpc-allowlist.test.ts`; add the two tables
     to `tests/rls-taproom.test.ts` role checks.
   - Accept: the test file, `tests/migrations-applied.test.ts`,
     `tests/schema-rules.test.ts`, `tests/schema-rls-indexes.test.ts` pass.
   - Deps: none.
2. **Mapping commands.**
   - Files: `lib/commands/qbo.ts`, `lib/mgr/api-operations.ts` (exclude
     `set_qbo_vendor_mapping` from the purchasing regex, as customers do, so it
     joins the other QuickBooks mappings).
   - Types: `z.object({ vendorId: z.string().uuid(), qboVendorId: z.string().trim().min(1) })`;
     `z.object({ category: z.enum(MATERIAL_CATEGORIES), qboAccountId: z.string().trim().min(1) })`.
     Take the category list from `Constants.public.Enums.material_category`
     (`lib/supabase/database.generated.ts`), as `lib/commands/stock-line.ts`
     does for keg sizes. No new copy of the list.
   - Test first: extend `tests/qbo-bill-mapping.test.ts` through `runCommand`.
   - Accept: test passes; `bunx tsc --noEmit`.
   - Deps: 1.
3. **`start_qbo_bill_push` and `finish_qbo_bill_push`.**
   - Files: the task 1 migration (still unmerged; re-run
     `bun run migrations:lock`).
   - Test first: `tests/qbo-bill-push.test.ts` (DB), calling the RPCs. The
     body carries the frozen vendor ID, account IDs, cents and `TxnDate`. Each
     step 7 block names its fix. A superseded receipt refuses a Bill. A second
     live Bill violates `qbo_bill_pushes_one_live`. Replay returns the same
     `provider_request_id` and body.
   - Accept: test passes; `tests/write-atomicity.test.ts`,
     `tests/command-idempotency.test.ts` pass.
   - Deps: 1.
4. **Extract `sendQboTransaction`.**
   - Files: `lib/qbo.ts`. Widen `createTransaction`'s type to
     `"Invoice" | "CreditMemo" | "Bill" | "VendorCredit"`.
   - Test first: a case in `tests/qbo-push.test.ts` that POSTs a `Bill` to
     `/v3/company/<realm>/bill?requestid=…`. Every existing case stays green.
   - Accept: `bunx vitest run tests/qbo-push.test.ts`; `bunx tsc --noEmit`.
   - Deps: none. Parallel with 1–3.
5. **`push_receipt_to_qbo` command.**
   - Files: `lib/qbo.ts` (`pushReceiptToQbo`), `lib/supabase/integration-tokens.ts`
     (`finishQboBillPush`), `lib/commands/qbo.ts`.
   - Test first: extend `tests/qbo-bill-push.test.ts` with a fake transport. A
     lost response retries the identical body and `requestid`. A 401 refreshes
     once. A 400 records `push_failed`. A `corrected` attempt then succeeds. A
     replay after success makes no HTTP call. VendorCredit: post a Bill,
     correct the receipt, then post a `VendorCredit`. Its lines equal the
     Bill's snapshot lines. The replacement receipt posts its own Bill. A
     credit for an unposted or unsuperseded receipt is refused.
   - Accept: test passes; `bunx tsc --noEmit`.
   - Deps: 3, 4.
6. **Receipt read carries post status.**
   - Files: `lib/commands/purchasing.ts` (`get_purchase_order` embeds
     `qbo_bill_pushes(entity_type, status, qbo_entity_id, error, created_at)`
     in its existing receipts select and keeps the latest per receipt; no
     query per receipt).
   - Types: `ReceiptSnapshot.qbo_bill?: { entity_type: "Bill" | "VendorCredit"; status: "pending" | "pushed" | "push_failed"; qbo_entity_id: string | null; error: string | null } | null`
     in `lib/mgr/receipt-view.ts`.
   - Test first: a case in `tests/purchasing.test.ts` (DB) that a posted
     receipt reads back its status; a brewer reads none.
   - Accept: test passes.
   - Deps: 3.
7. **Pure presentation rules.**
   - Files: `lib/mgr/qbo-ui.ts`: `qboBillPresentation(input)` returns
     `{ detail, actions }` with actions from `"post" | "retry" | "corrected_post" | "credit" | "fix_mapping"`;
     `qboBillConfirmation(action, receiptLabel)` mirrors `qboPushConfirmation`.
   - Test first: `tests/qbo-ui.test.ts`. Warehouse gets no actions. An
     uncertain post offers only the exact retry. A superseded posted receipt
     offers `credit`.
   - Deps: none. Parallel with 1–6.
8. **Receipt screen.**
   - Files: `lib/mgr/receipt-view.ts` (`qbo?: { detail: string; actions: … }`
     on `ReceiptViewModel`), `components/mgr/views/receipt.tsx` (an `E.fld`
     "QuickBooks" row and an action slot), a client action in
     `app/(app)/purchase-orders/[id]/po-actions.tsx` that confirms before
     `push_receipt_to_qbo`, `components/mgr/screens.tsx` "Receipt" `writes`
     and a posted-receipt fixture in `lib/mgr/fixtures/purchasing.ts`.
   - Test first: `tests/purchasing-view.test.ts` maps a snapshot to the QuickBooks row.
   - Accept: the screen-only proof list in AGENTS.md; a look at the page with
     the `browse` skill.
   - Deps: 5, 6, 7.
9. **Mappings screen.**
    - Files: `app/(app)/settings/accounting/mappings/page.tsx` (Vendors and
      Expense accounts sections), `qbo-controls.tsx` and
      `components/mgr/views/qbo-mapping.tsx` (`MappingRow.kind` adds
      `"vendor" | "account"`), `screens.tsx` "QuickBooks mappings".
    - Test first: `tests/qbo-mapping-view.test.ts` and `tests/qbo-controls.test.ts`
      for the two new kinds' labels and command inputs.
    - Accept: screen-only proof list; browse check.
    - Deps: 2.
10. **Docs.**
    - Files: `content/docs/staff-guide.mdx` (Purchasing → Purchase orders:
      posting, blocks, credits; Accounting: the two new mapping sections),
      `content/docs/api/` via `bun run docs:api`.
    - Test first: `tests/api-docs.test.ts` fails until the generated blocks
      list the four new operations.
    - Accept: `tests/api-docs.test.ts`, `tests/docs.test.ts`,
      `tests/design-docs.test.ts` pass.
    - Deps: 2, 5, 8, 9.
11. **Final proof.** `bun run test && bunx tsc --noEmit && bun run lint`,
    then `/simplify`, then the same checks again.
    - Deps: all.

Parallelism: 1, 4 and 7 start together. 2 and 3 follow 1, in parallel. 5
waits on 3 and 4; 6 follows 3. 8 and 9 run in parallel. 10 and 11 close.
Tasks 1 and 3 edit one migration file, so one agent owns both in sequence.

## Out of scope

- Pushing the PO.
- Reading bill balances or payments back.
- Editing a unit cost after receipt.
- Matching vendors by name.
