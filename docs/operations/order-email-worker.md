# Buyer order-confirmation email

How the order-confirmation email worker is configured and scheduled, and how an operator reads its failures and recovers.

Wholesale confirmation queues mail for the customer's currently linked portal
buyers. No linked buyers produces a blocked `no_recipient` record. Admin/Sales
can read order email states through the [Orders API](/docs/api/orders). The
status `accepted` means Resend accepted it, not that it reached an inbox.

The internal `POST /api/email/jobs/deliver` worker requires a bearer token
matching `ORDER_EMAIL_JOB_SECRET`. It uses `RESEND_API_KEY` and
`ORDER_EMAIL_FROM`; missing configuration refuses the job before any lease.
Each call processes at most ten emails. `.github/workflows/hosted-jobs.yml`
calls it every 5 minutes (Vercel Hobby cron is daily at most). It needs the
repository variable `MGR_URL` and the secret `ORDER_EMAIL_JOB_SECRET`, equal to
the Vercel value. Jobs skip until `MGR_URL` is set; after that a failed call
fails the run.
Domain and provider credentials require user approval (#311).
Tests mock the provider and send no real mail.

## Failures and retries

Worker failures emit `Order email delivery failure` with sanitized `stage` and
`category` fields. Provider failures include `providerStatus` when an HTTP
response exists. A validated opaque `deliveryId` identifies a leased delivery;
logs never include recipients, message contents, credentials, raw provider
payloads, or exception messages. The status API keeps its existing generic
`provider_uncertain` / `provider_rejected` codes; detailed causes are operator
logs, not customer-facing fields. Provider retries still return HTTP 200 with a
retry count; fatal worker failures still return a generic HTTP 500.

Use the log category to recover before the saved 23-hour cutoff:
- `configuration` at the configuration stage: restore the worker's provider,
  sender, or service-client settings before the next scheduled run.
- `authentication` with HTTP 401/403: investigate the Resend key and sending
  domain authorization. Fix approved configuration promptly; these still retry.
- `rate_limit` (429), `outage` (5xx), `concurrent_request` (idempotent 409),
  `network`, or `malformed_response` at send: investigate provider health or
  response handling and let scheduled retries reuse the frozen request.
- `rejected` at send: investigate the definitive provider rejection using its
  HTTP status and delivery identity; the existing delivery stays blocked.
- `database` at lease or record_result: restore database access. A record_result
  failure may follow provider acceptance; never create a replacement send.
- `malformed_response` at lease: investigate the lease RPC contract before
  restarting. No provider call occurs for an invalid leased batch.
- `lease_lost` at record_result or `lease_expired` at send: investigate worker
  timing/concurrency; let the lease workflow recover with the same identity.
- `retry_window_expired`: the lease RPC normally blocks expired deliveries
  before returning them, so inspect this code through the status API. The worker
  logs it only when the cutoff passes after leasing. Investigate the provider's
  outcome; do not reset the window, change the provider key, or automatically
  resend a blocked delivery.

Retries preserve the original recipient, body, sender and provider key.
[Resend retains idempotency keys for 24 hours](https://resend.com/changelog/idempotency-keys);
MGR stops after 23 hours from the first attempt. A blocked uncertain delivery
requires provider investigation and never automatically receives a new key.
Removed buyers or changed addresses suppress pending mail. Existing historical
confirmations are not backfilled, and a confirmed order is not undone by a
failed email.
