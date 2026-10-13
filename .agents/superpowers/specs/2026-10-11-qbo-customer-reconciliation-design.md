# QuickBooks customer reconciliation — design

Date: 2026-10-11. Status: approved in conversation; awaiting spec review.

## Why

A brewery may move MGR onto a QuickBooks company that already has customers.
Today MGR links a customer to QuickBooks only by a pasted id
(`set_qbo_customer_mapping`), cannot read or create QuickBooks customers, and
stores no customer email, phone, or billing address. Moving onto a populated
company means hand-copying ids for every customer, and duplicates are likely.

## Decisions

| Question | Decision |
| --- | --- |
| Which side owns a linked customer | MGR. MGR edits push to QuickBooks. QuickBooks edits are detected and flagged, never applied silently. |
| When a new MGR customer reaches QuickBooks | On first invoice push, after a duplicate check. |
| Contact fields | MGR stores billing email, phone, and billing address, and owns them. |
| Likely-match detection | Rules in Postgres (`pg_trgm`, `unaccent`), each suggestion with its reasons. |

Assumptions, confirmed in conversation:

- A person confirms every link. A suggestion never links itself.
- Import from QuickBooks is per customer, not bulk. Real companies hold
  one-off and retail customers that do not belong in MGR.
- One QuickBooks customer links to at most one MGR customer, per realm.

Consistent with existing rules: mappings are exact ids and MGR never picks a
record by name alone (`content/docs/staff-guide.mdx`, QuickBooks mappings);
"detect drift, do not prevent it" (`2026-08-31-mgr-schema-decisions.md`).

## Data model

One new migration.

- Enable `pg_trgm` and `unaccent`.
- `customers` gains `billing_email`, `phone`, `bill_address1`,
  `bill_address2`, `bill_city`, `bill_state`, `bill_zip` (nullable text).
- `customers` gains `qbo_sync_token text`: QuickBooks' version of the record
  as of MGR's last write or accepted read.
- `customers` gains `qbo_sync_state text`: `in_sync`, `pending` (an MGR edit
  waits to push), `changed_in_qbo` (QuickBooks edited the record), or
  `inactive_in_qbo`. Null when unlinked.
- Unique index on `customers (brewery_id, qbo_realm_id, qbo_customer_id)`
  where `qbo_customer_id is not null`.
- `qbo_customer_snapshots`: one row per QuickBooks customer in the connected
  realm. Columns: `brewery_id`, `realm_id`, `qbo_customer_id`, `display_name`,
  `company_name`, `email`, `phone`, `bill_address1`, `bill_address2`,
  `bill_city`, `bill_state`, `bill_zip`, `active`, `sync_token`,
  `qbo_updated_at`, `read_at`. Primary key
  `(brewery_id, realm_id, qbo_customer_id)`. Staff-only RLS; never exposed to
  the portal (same boundary as #788).
- `qbo_customer_decisions`: `brewery_id`, `realm_id`, `qbo_customer_id`,
  `customer_id` (null for an ignore), `decision` (`not_a_match` | `ignore`),
  `decided_by`, `decided_at`. Suppresses a rejected pair or an ignored
  QuickBooks customer on every later refresh.

MGR-owned fields, mirrored to QuickBooks on push: `name` (QuickBooks
`DisplayName`), `billing_email`, `phone`, and the billing address. Drift and
the field review compare exactly these.

Matching, the import list, and drift detection read snapshots, never
QuickBooks directly.

## QuickBooks client

New methods on the existing client in `lib/qbo.ts`, reusing its token refresh
and recovery path:

- `queryCustomers(realmId, changedSince?)`: paged query over `Customer`,
  inactive included, optionally filtered to `Metadata.LastUpdatedTime` after
  `changedSince`.
- `createCustomer(realmId, requestId, body)`: the request id makes a retry
  return the original result.
- `updateCustomer(realmId, requestId, id, syncToken, fields)`: sparse update.
  A stale-token rejection surfaces as a typed error.

## Snapshot refresh

Runs on **Refresh from QuickBooks** (reconciliation screen) and inside the
existing invoice sync. The first refresh for a realm reads everything; later
ones read changes since the newest `qbo_updated_at`.

After writing snapshots, for each linked customer:

- An inactive snapshot sets `inactive_in_qbo`.
- A snapshot whose `sync_token` differs from `customers.qbo_sync_token`, and
  whose MGR-owned fields differ from MGR, sets `changed_in_qbo`.

## Matching

One SQL function, `qbo_customer_match_candidates(p_brewery)`. It compares
each unlinked MGR customer with each unlinked, active snapshot in the
connected realm.

| Signal | Weight |
| --- | --- |
| Same email, lowercased | strong |
| Same phone, digits only, last 10 | strong |
| Same normalized name | strong |
| Name similarity (`pg_trgm`) ≥ 0.5 | medium, scaled by similarity |
| Same zip as the billing address or any ship-to | weak |

Normalized name: unaccented, lowercased, punctuation removed, entity suffixes
removed (LLC, Inc, Co, Corp, Ltd), words sorted. The suffix list lives in one
SQL function so tests pin it.

Excluded: pairs and snapshots in `qbo_customer_decisions`, linked records on
either side, inactive snapshots. Each MGR customer gets its best candidate,
and each snapshot goes to at most one MGR customer (highest score wins).

Each row returns its score, its matched signals, and a band: `high` when email
or phone matched, `medium` otherwise above the threshold.

## Reconciliation screen

**Settings → Accounting → Customer reconciliation**, Admin and Sales. A shared
view built from E controls with an inventory fixture, per the screens rules.
Three lists:

1. **Likely matches.** MGR and QuickBooks records side by side, with reasons
   and band. **Link** opens the field review. **Not a match** records a
   decision. **Link all high-confidence** links only `high` rows, after a
   confirmation listing every pair; each uses the field review defaults.
2. **Only in QuickBooks.** **Import to MGR** creates the customer from the
   snapshot and links it. **Ignore** records a decision.
3. **Only in MGR.** **Link to…** searches snapshots for a manual link.

The existing **Fix mapping** sheet keeps working and gains the snapshot
search beside its id field.

## Linking

The field review lists each MGR-owned field that differs from the snapshot,
with **Keep MGR** or **Take QuickBooks**. The default is Keep MGR, except an
empty MGR field defaults to Take QuickBooks. On confirm, one command:

1. Rechecks that the realm is the connected one and the QuickBooks customer
   is still unlinked (the snapshot may be stale).
2. Writes the link and the taken fields to MGR.
3. Sparse-updates QuickBooks with the kept MGR values and stores the returned
   sync token. If QuickBooks is unreachable, the link stands and the customer
   is `pending`.

## Sync after linking

- **MGR edit to a linked customer:** set `pending` and push a sparse update
  with the stored sync token. Success stores the new token and sets
  `in_sync`. A stale token sets `changed_in_qbo` and overwrites nothing.
  Unreachable or recovery-required leaves `pending`; the next push or sync
  retries.
- **Changed in QuickBooks:** the customer shows a badge. Resolving uses the
  field review: Keep MGR pushes, Take QuickBooks writes MGR. Nothing resolves
  without a person.
- **Inactive or deleted in QuickBooks:** the customer shows a badge, the next
  invoice push is blocked with that reason, and nothing in MGR is deleted.

## Create on first invoice push

When an invoice push finds its customer unlinked:

1. Refresh snapshots (incremental).
2. If the customer has any candidate, or a snapshot has the same display name
   (QuickBooks requires unique display names), block the push with
   **Possible duplicate in QuickBooks**, linking to reconciliation.
3. Otherwise create the customer with a request id derived from the invoice
   push request, link it, store the sync token, and continue the push.

## Errors

No silent fallbacks.

- Intuit 401 uses the existing refresh and recovery path.
- 429 and 5xx leave the work `pending` with the Intuit error code and request
  id recorded.
- Validation errors, such as a duplicate name, show on the row with Intuit's
  message.
- A link made against a different realm is treated as unlinked, as today.
  Reconnecting never reuses another company's ids.

## Permissions

Admin and Sales reconcile, link, import, ignore, and resolve drift. Warehouse
cannot. The portal never reads `qbo_*` columns, snapshots, or decisions.

## Testing

- Pure (vitest): name normalization and reason text.
- SQL on the `mgr_test` stack: match scoring with fixtures for email, phone,
  normalized name, trigram, zip, rejected pair, ignored snapshot, inactive
  snapshot, and the one-to-one rule; link recheck and uniqueness; import;
  drift detection on refresh; import copies every MGR-owned field.
- QuickBooks client with a fake fetch: query paging, changed-since, sparse
  update, stale-token error, create retry returning the original.
- Manual sandbox acceptance: reconcile Test Company's sample customers, then
  push an invoice for an unlinked customer and confirm it is created once.

## Documentation

Staff guide: the reconciliation screen, the field review, the sync states,
and the duplicate block on invoice push. API reference regenerated for the
new commands.

## Out of scope

- AI tiebreak on medium matches (can layer on the same scores later).
- Products and items reconciliation. Same pattern, its own spec after this
  ships.
- Merging two MGR customers into one.
- Linking without a person.
