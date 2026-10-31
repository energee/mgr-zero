# Slack notifications

How an operator configures the Slack app, its Chat SDK database login, and secret rotation for chat notifications.

Slack setup uses `APP_URL`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
`SLACK_SIGNING_SECRET`, `CHAT_SDK_ENCRYPTION_KEY`, `CHAT_STATE_DATABASE_URL`,
and `CHAT_JOB_SECRET`. Keep all but `APP_URL` server-only. `APP_URL` is the
public HTTPS origin used for OAuth, events, and interactivity callbacks; use an
owned preview or tunnel origin, not localhost, an IP address, or a reserved
placeholder domain.

Create the Chat SDK login interactively as a database administrator. It is a
login member of only the migration-owned `mgr_chat_sdk` role and defaults to
the private `chat_sdk` schema:

```sql
create role mgr_chat_runtime login;
grant mgr_chat_sdk to mgr_chat_runtime;
alter role mgr_chat_runtime set search_path = chat_sdk;
\password mgr_chat_runtime
```

Set `CHAT_STATE_DATABASE_URL` to that dedicated login, never the database owner.
On the hosted pooler only, also set `CHAT_STATE_DATABASE_CA` to the PEM
certificate from Supabase Database Settings; leave it unset locally.
Its password is entered at the `psql` prompt and is not committed. Generate the
Slack manifest after setting the public origin:

```bash
bun run render:slack-manifest
```

Import `.local/slack-app-manifest.yml` in Slack, then confirm the generated
OAuth redirect, events URL, and interactivity URL use the same tunnel or
preview origin. Rotate Slack client/signing secrets and `CHAT_JOB_SECRET` in
the deployment secret store. To rotate `CHAT_SDK_ENCRYPTION_KEY`, disconnect
installations and finish credential cleanup first, replace the key, then
reauthorize each workspace; old encrypted installation tokens cannot be read
with a new key. The scheduled chat-state cleanup endpoint is
`POST /api/chat/jobs/cleanup`, authenticated with `CHAT_JOB_SECRET`.

The manifest requests `users:read` to show the Slack person's display name,
user id, workspace name, and workspace id before linking. Existing workspaces
need an owner-approved manifest update and administrator reauthorization to
grant it. No hosted permission change is performed by applying the code or
database migration. Until the profile lookup succeeds, Home does not issue
a link proof. Older pending links without a display name must be restarted
from Slack Home.


Measured delivery and scan capacity against the 60 s delivery lease are in
[worker capacity, 2026-10-23](worker-capacity-local-2026-10-23.md).
