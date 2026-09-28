# Purchase receipt corrections (#647)

Status: technically reviewed. Implementation follows #622 and #623 on
main. Migration reservation: `20260928110000`–`20260928115959`.

## Existing owners and v1 cross-check

`receive_purchase_order` owns receipt lines, stock and PO status in one
transaction. Its latest definition is `20260924180000_receipt_cost_precision.sql`.
`receipts`, `receipt_lines`, `material_lots` and `material_movements` already own
the identities needed here. `po_open_balances` derives received/open quantities.
`material_last_cost` supplies recipe costs from receipt movements.

V1 `00248_receive_purchase_order_items.sql` moved receiving from separate client writes
into one locked transaction. Its key lesson is that receipt facts and the PO
status must commit together, including under concurrent receipts. Retain that
boundary. Do not introduce a separate vendor-return workflow.

## Immutable replacement receipt

Add an optional unique `corrects_receipt_id` and required correction reason to
a replacement receipt. The link is same-tenant and same-PO. Original receipts
and their lines remain unchanged. Each revision has at most one successor.
An effective receipt has no successor; all revisions remain in the PO history.

Replacement lines name the original PO line, corrected counted quantity and
actual lot facts. Quantities remain in the original purchase unit. Freeze the
purchase unit, base-unit factor, material name/unit and per-purchase-unit cost
when receiving; later material or PO edits cannot alter a correction's meaning.
Existing receipts without a frozen factor can only be corrected when their
positive movement and counted quantity establish that factor exactly. Refuse
an ambiguous historical zero-count conversion and explain which fact is absent.
Do not silently use today's factor for a historical receipt.

A lot-code correction selects or creates the actual lot. It never renames a
shared original lot. Freeze lot code, received date and best-by on receipt
lines so history remains readable. Historical receipts without these snapshots
show that original lot metadata was not captured; do not backfill today's lot
metadata as an original fact. A best-by correction may update the current lot only when that lot belongs
solely to this receipt revision chain and has no subsequent use. Preserve the
original best-by in the frozen receipt facts. A shared existing lot with a
conflicting best-by is refused with an explanation; no separate lot-edit command
exists, so the correction must select the actual matching lot rather than promise
an unavailable recovery action. Lock shared lot identity while checking usage.

## Atomic correction and stock boundary

`correct_purchase_receipt(receiptId, reason, lines, requestId)` retains the
receive command's Admin/Warehouse scope and command-request replay. It locks
the PO and original receipt, then shared lot identities before the material
ledger, matching receiving's lot-before-movement order. Recheck usage under the
ledger lock before writing; coordinate the exact strategy with movement writers
so stock use cannot race the eligibility check. It
rejects a revision that already has a successor and returns a reload message.
A cancelled PO cannot be corrected through this receiving flow.

Reuse #622's material compensation contract: append an exact opposite
`adjustment` linked by `compensates_id`, then replacement positive `receipt`
movements linked from replacement lines. Preserve the original cost facts.
Zero counted quantity creates no positive movement. Validate the resulting
stock balance before committing anything.

Reject a reversal if any subsequent negative material movement exists in the
original material/location/bin/lot bucket. This conservative rule includes
consumption, loss, transfer-out and count adjustments; current on-hand alone
cannot prove that the original goods remain unused. Untracked stock gets the
same bucket-level rule because it has no finer provenance. Return a recoverable
message naming the dependency, without writing a replacement or compensation.
Changes to lot facts must also reject a lot already referenced by downstream
production even if another receipt used the same lot in a different bucket.

`po_open_balances` counts only effective receipt lines. Recompute PO status
inside the same transaction and allow a previously received PO to become
partially received again after a lower corrected count. Other effective
receipts still contribute. Expected quantity and variance on the replacement
are measured against the order excluding the replaced revision.

`material_last_cost` excludes compensated receipt movements. A replacement
keeps the original economic receipt ordering, so correcting an old receipt
must not supersede a genuinely later receipt cost merely because its revision
was recorded today. Break equal-time ties deterministically by receipt identity.
Recipe cost readers continue using that single cost owner.

## Views and proof

PO detail shows original and corrected receipts with reason and revision links.
An eligible receipt exposes Correct receipt using the shared Receive PO fields.
Inventory and live forms share E controls and the same source/quantity view.
Update the staff guide and generated API reference.

Begin with failing tests for an unused receipt quantity/lot correction,
received-to-partial status, another receipt retaining its contribution,
zero-count correction, frozen conversion after master edits, and cost ordering.
Prove consumption and shared-lot provenance refusals write nothing. Cover
cross-tenant IDs, role denial, concurrent correction and duplicate retry.
Run full local proof, browser/parity checks, simplify/explain and independent
review before delivery.
