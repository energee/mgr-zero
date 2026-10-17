# Order and invoice detail concepts — 2026-10-16

Static design assets for two focused detail-page issues under #909. Related #943 and #945 cover the list pages; these concepts do not expand those list issues or change the customer portal.

| Detail surface | Editable source | Desktop | Phone | Annotated board |
| --- | --- | --- | --- | --- |
| Staff order | [HTML](detail-order.html) | [Image](detail-order-desktop.png) | [Image](detail-order-mobile.png) | [Board](detail-order.png) |
| Staff invoice / credit memo | [HTML](detail-invoice.html) | [Image](detail-invoice-desktop.png) | [Image](detail-invoice-mobile.png) | [Board](detail-invoice.png) |

Serve this directory over HTTP with the existing `style.css`. Boards contain a 962px desktop panel and a 390px phone panel. Phone images show scrollable content, not a promise that the whole document fits one viewport. Alternate states are explicitly separate examples. Values and identities are fictional; controls do not execute commands, provider operations or navigation.

## Price-summary contract

- Each document has one prominent summary, beside the details on desktop and before line items on phone.
- Order figures use ordered quantities and existing line prices/frozen keg-charge facts. The summary is not a shipment invoice, a payment request or a promise that draft charges have been finalized. Transfer values do not imply a customer receivable.
- Invoice figures preserve `invoiceCurrentTotalCents` precedence and stored line amounts. Current QuickBooks total and frozen MGR line subtotal stay distinguishable when different. An unexplained difference is not invented tax or a fabricated adjustment.
- Outstanding balance is separate from invoice total. Missing is unknown, not zero. Zero alone does not mean paid. Credit, voided, deleted and written-off documents must not present an active amount due merely because stale provider data contains a positive figure.
- Deposits and non-refundable one-way keg fees remain separate. No new tax, delivery, discount, payment-date or email-delivery facts are inferred.

## Implementation boundaries

The detailed issue plans contain source owners, structured-field migrations, current role/state action gates, amount arithmetic, missing-value rules, shared inventory/live composition, documentation requirements and future implementation proof. They are not evidence that those changes have shipped.

Use the existing shared views, adapters, E vocabulary, money/date helpers and authorized query/command boundaries. Preserve existing exact-request recovery and explicit null-slot suppression. Do not introduce independent fixture/live drawings, a generic document framework, new lifecycle shortcuts, provider operations, or unsupported production facts.

Reviewed source baseline: `b74c620869b7fa98e61b588ab36e8b183d8b2708`. Assets are published in isolated design-only history/tag, not on the application branch. No application implementation, migration, dependency or deployment is included.
