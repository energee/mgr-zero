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

Local Auth configs allow password-recovery callbacks on localhost and 127.0.0.1,
ports 3000 and 3002, under `/auth/confirm`. Restart the relevant local Supabase
stack after changing its redirect allowlist. Hosted Auth needs its own approved
origin and invitation template when deployment is configured.
