# Data retention and closing a brewery (#766)

The scheduled prune of old command records, and the admin scripts that export and close a brewery.

`POST /api/retention/jobs/prune` requires a bearer token matching
`RETENTION_JOB_SECRET`. It removes command replay records
(`private.command_requests`) older than 90 days, keeping unfinished ones and any
that QuickBooks/Square sync history or portal quotes still reference. A
`.github/workflows/hosted-jobs.yml` calls it daily, with the secret
`RETENTION_JOB_SECRET` equal to the Vercel value.

The same call then reaps QuickBooks connects whose callback died after Intuit
issued tokens (#1034). An exchange older than ten minutes is marked for
recovery. Its held refresh token is revoked at Intuit, unless a stored
connection uses that QuickBooks company, and then discarded. While a newer
connect for the brewery is still in progress the token is left for a later
run. A failed revoke keeps the token for the
next daily run; after seven days it is discarded unrevoked. The response
reports `qboReap: { done, failed }`, where one row's failure never stops the
others. Any failed row makes the response HTTP 500 with `ok: false`, retaining
the counts so the scheduler reports partial failure. Without the QuickBooks
variables (`QBO_CLIENT_ID` and the rest) the reap is skipped and `qboReap` is `null`.

Closing a brewery and exporting its records are admin-run, with a direct
service-role `DATABASE_URL`:

- `bun scripts/brewery-lifecycle.ts export <breweryId> <dir>` writes one CSV per
  business table (integration and chat plumbing excluded) from one consistent snapshot.
- `bun scripts/brewery-lifecycle.ts close <breweryId>` ends every staff and buyer
  login, revokes open invitations and stamps `breweries.closed_at`. Disconnect
  QuickBooks, Square and Slack in Settings first; close refuses otherwise. No
  record is removed. Keep records for 3 years from the printed date; removing
  them after that is a manual step.
