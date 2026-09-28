# Buyer order-confirmation email (#625)

Confirming a wholesale order inserts one private delivery per currently linked
buyer in the same transaction as confirmation and allocations. The existing
command-request ledger prevents duplicate confirmation. An order without linked
buyers retains a blocked `no_recipient` delivery; it does not send email.
Recipients come only from that customer's `customer_users` and Auth email.
No customer contact model or QuickBooks invoice-email behavior is added.

The delivery freezes the recipient, order number, brewery name, requested date,
and confirmed line quantities and names. The first worker lease freezes the
configured sender. Later account or order edits cannot retarget an attempted
message. The worker checks current membership and matching Auth email before
leasing; removed or changed recipients are suppressed. Each email has one
recipient, so other buyer addresses are never exposed.

A service-only RPC leases at most ten deliveries for ten minutes using locked
rows and an opaque lease token. A bearer-authenticated internal job sends them
through Resend's HTTP API with the delivery UUID as its idempotency identity.
Only the matching lease can record acceptance, retry, or rejection. Provider
acceptance is not proof of inbox delivery. Transport errors retain the body and
key; retries wait five minutes. A lost response can replay the identical body.

[Resend retains idempotency keys for 24 hours](https://resend.com/changelog/idempotency-keys).
The worker stops retries 23 hours after the first lease. An uncertain message
then stays blocked for operator investigation; it never gets a fresh identity
automatically. This conservative margin also covers lease and request timeouts.
Permanent provider rejection stays blocked. A 401 or 403 is MGR's own key or
sending domain, not the buyer, so it retries like a transport error until the
configuration is fixed or the window ends. There is no automatic resend of a
blocked confirmation and no replay of confirmations predating this migration.

Admin and Sales can read delivery states for a tenant-visible order through
`get_order_email_status`. No provider body, key, or other customer's delivery
is exposed. Hosted domain, API credentials and scheduling remain #311 work;
this PR adds no deploy or real email delivery. Tests use a mocked provider.
