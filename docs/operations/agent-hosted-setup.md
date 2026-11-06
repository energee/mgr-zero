# Turn on outside agents on hosted

Outside agents sign in through Supabase's OAuth server, which is off until these
steps are done. Do them in order. Plan: `docs/plans/agent-access.md`, R4.

The MGR code and migrations reach hosted on every merge to `main`. These steps are
dashboard settings. They are not in the repo, so nothing applies them for you.

## Before you start

Confirm the endpoint is live. A call with no token should answer `401`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$MGR_URL/api/mcp"
```

## Steps

1. **Signing keys.** In Project Settings, open JWT Keys. The current key must be
   ECC P-256, not Legacy HS256. The OAuth server needs an asymmetric key.
2. **Token hook.** In Authentication, open Hooks, then Customize Access Token.
   Enable the Postgres hook on schema `private`, function
   `agent_access_token_hook`. The hook stops agent tokens reaching Supabase Auth.
3. **Check sign-in at once.** In a private window, sign in to MGR with a normal
   account. A failing hook breaks every sign-in. If it fails, disable the hook,
   which restores sign-in, and do not continue.
4. **OAuth server.** In Authentication, open OAuth Server. Enable it. Set the
   authorization path to `/oauth/consent`. Allow dynamic client registration. The
   Site URL must be the MGR production address.

Local settings for steps 2 and 4 are in `supabase/config.toml`, under
`[auth.hook.custom_access_token]` and `[auth.oauth_server]`.

## Check it worked

The sign-in server should publish its metadata, with `200`, not
`OAuth server is disabled`:

```bash
curl -s "$SUPABASE_URL/.well-known/oauth-authorization-server/auth/v1"
```

Then turn on **Allow outside agents** for one brewery, under **Agents** in
**Settings**, and connect one client to `$MGR_URL/api/mcp`.

## Undo

Turn off **Allow outside agents** to stop every agent at a brewery at once.
Disable the OAuth server to stop new connections everywhere. Disable the hook
only with the OAuth server off: the hook is what keeps an agent token away from
Supabase Auth, where it could change the person's password.
