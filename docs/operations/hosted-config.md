# Hosted configuration

Deployment and Auth settings an operator configures beyond local setup: function region, QuickBooks credentials, dedicated mode, invitation-only signup, and recovery redirects.

`vercel.json` pins functions to `iad1` (Virginia), alongside the production
Supabase project `uogrvqmrbmolvtftotsf` in `us-east-1`. Recheck this pairing if the database moves:
sequential Auth and Data API requests otherwise pay cross-region latency.

QuickBooks setup uses server-only `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`,
`QBO_REDIRECT_URI`, and `QBO_API_BASE`. The example API base is Intuit sandbox;
production must use `https://quickbooks.api.intuit.com`. The redirect must
exactly match the callback registered with Intuit.

A QuickBooks token refresh interrupted after Intuit answered (crash, deploy, or
the 20-second token timeout) can leave a retired token stored, so the next
refresh marks the connection for recovery and an Admin must reconnect; this is
an accepted risk (#1073).

`MGR_DEDICATED=1` hides the hosted-web **Create brewery** page and makes brewery
creation refuse (403) for every caller, web or API. The database function is
service-role only, so signed-in accounts cannot bypass the server through
PostgREST (#467). Omit it for the hosted web entry.

Accounts are invitation-only: local Auth sets `enable_signup = false`, and the
invite path (`inviteUserByEmail`) and admin-created accounts still work. Hosted
Supabase Auth keeps its own signup setting; turn off **Allow new users to sign
up** in the hosted project separately.

Hosted Auth requires the current password to change a password
(`security_update_password_require_current_password: true`, enabled 2026-10-26,
#1319). A direct `PUT /auth/v1/user` without `current_password` gets
`current_password_required` (400). The app's Change password sends it. A
reset-link session and a first password set while accepting an invitation do
not need it. Leave `security_update_password_require_reauthentication` off: that
is the recent-login nonce, not the same control.

Local Auth configs allow password-recovery callbacks on localhost and 127.0.0.1,
ports 3000 and 3002, under `/auth/confirm`. Restart the relevant local Supabase
stack after changing its redirect allowlist. Hosted Auth needs its own approved
origin and invitation template when deployment is configured.

Passwordless and password-recovery emails use the configured `APP_URL`, never
the incoming request's Origin. Hosted Auth's Site URL and redirect allowlist
must use the approved exact origin and `/auth/confirm` callback, without wildcard
hosts or paths. Inspect `site_url` and `uri_allow_list` through the read-only
Management API before release; a local allowlist is not evidence of hosted
configuration. Changing hosted settings remains owner-authorized work.

`APP_URL` is that one public origin, and Slack links and portal payment
redirects use it too. The `/api/command` and `/api/chat` Origin check accepts
the origin the request was sent to as well as `APP_URL`, so a Vercel preview
host passes it without an `APP_URL` of its own.

Read-only inspection on 2026-10-30 for #1659 used
`supabase config diff --project-ref uogrvqmrbmolvtftotsf --output-format json`.
The remote Site URL was `https://mgr-zero-mgr8.vercel.app/`.
The remote redirect allowlist contained exact root and `/auth/confirm` URLs,
but also `https://mgr-zero-mgr8.vercel.app/**`,
`https://mgr-*-zero-mgr8.vercel.app`, and
`https://mgr-*-zero-mgr8.vercel.app/**`. The no-wildcard acceptance remains
open: the owner must approve the required exact callback origins and remove
the wildcard entries. This inspection changed no hosted settings.



## Invitation delivery diagnostics

Auth invitation sending uses the hosted Supabase project's SMTP settings, not
the app's buyer-confirmation transport. An Auth `email_address_invalid`
refusal can reject example/test domains; `email_address_not_authorized` means
the default SMTP service restricts recipients and a custom SMTP provider is
needed. Email/request rate limits require waiting, not repeated submissions.
Check the invitation request's durable ledger and bounded Auth `/invite` logs
before assuming an email was sent. Never log provider response bodies, email
addresses, invitation tokens, SMTP passwords, or service credentials.

Read-only Production inspection for [#1318](https://github.com/energee/mgr-zero/issues/1318)
on 2026-10-24 found the reported request in `failed` with no bound Auth identity.
The corresponding 03:53:05Z and 03:53:20Z Auth events refused `/invite` with
`email_address_invalid` (400). Current SMTP host, sender, and password were
unset, and the email-send limit was 2. These observations establish the
reported test-domain refusal and the remaining configuration gate; they do not
prove actual delivery. The sending domain, custom SMTP, and approved real-inbox
acceptance remain owner work under [#311](https://github.com/energee/mgr-zero/issues/311).
No provider send or hosted setting change was performed for this inspection.
