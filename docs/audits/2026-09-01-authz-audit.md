# Authorization audit — 2026-09-01 (branch `audit-p1-authz` @ `0bbf07a`)

Fresh database + application security/authorization audit of the current state.
The original audit (snapshot `96ba05c`) was lost; its P1.1–P1.5 and P1.9 items
were remediated on this branch (`docs/plans/audit-p1-authz.md`). Everything
below is what is **still open now**. Findings were produced by two reviewers
that verified by execution against the local Supabase stack (schema reset from
this worktree first).

Severity: **P1** exploitable cross-tenant / privilege / credential issue ·
**P2** fails open or weakens a guarantee without a direct exploit · **P3**
hardening / hygiene.

## Database

### D1 — P1: portal customers can read staff-only `breweries` columns

**Where:** `supabase/migrations/00001_baseline.sql` — `staff_read` /
`customer_read_portal_config` policies on `breweries`, plus
`grant select on all tables in schema public to authenticated`.

**Claim:** `authenticated` has table-wide `SELECT` on `breweries`. The customer
policy filters rows only, so a wholesale-customer portal user reads every column
of their brewery's row, including `ttb_registry_no`, `pa_license_no`, and the
free-form `settings` jsonb — none of which is customer-facing.

**Evidence:** Seeded `ttb_registry_no='TTB-SECRET-123'`, `pa_license_no='PA-LIC-999'`,
`settings={"internal_note":"do not show customers"}`; created a real Auth user
linked via `customer_users`; `GET /rest/v1/breweries?id=eq.<id>&select=*` with that
user's bearer token returned the full row. `tests/schema-rules.test.ts`'s ACL
matrix checks table-level privileges only, so it passes vacuously.

**Fix:** Give customers a `security_invoker` view (`id`, `name`, `timezone`,
`portal_fulfillment_location_id`) and revoke base-table `SELECT` from the
customer path; or move `ttb_registry_no` / `pa_license_no` / `settings` to a
staff-only table. Add a column-exposure assertion to `tests/schema-rules.test.ts`.

### D2 — P2: internal lifecycle helpers `lock_order` and `order_line_price` are directly callable

**Where:** `supabase/migrations/00001_baseline.sql` — `lock_order(uuid, order_status[])`,
`order_line_price(uuid, uuid, uuid)`; grants in the explicit-grants section
(pinned intentionally in `tests/schema-rules.test.ts`).

**Claim:** Every transition RPC checks `require_authorized_staff_rpc` before
calling the shared `lock_order` helper, but `lock_order` itself has no role
check, is granted to `authenticated`, and takes an attacker-controlled
`p_allowed`. Any staff role (including `brewer`) can call `/rpc/lock_order`
directly to lock + read an order row outside the one-RPC-per-transition
boundary. No privilege escalation today (the row is already readable via
`staff_read`), but any future side effect added to `lock_order` inherits an
open call path.

**Evidence:** `proacl` shows `authenticated=X/postgres` on both. `order_line_price`
verified *not* exploitable for cross-tenant price disclosure (RLS on
`price_list_items` returns "no price" rather than the amount).

**Fix:** Revoke `EXECUTE` on both from `authenticated`. Note: a `security invoker`
caller still needs EXECUTE on the callee, so this needs either a `SECURITY DEFINER`
wrapper owned by `postgres` with its own `require_authorized_staff_rpc` guard, or
an in-function `request.path` check inside `lock_order` accepting only the
lifecycle RPC names. Re-pin in `tests/schema-rules.test.ts` and prove with
`tests/rls-command-boundary.test.ts`.

### D3 — P3: `breweries.settings` jsonb is unconstrained

**Where:** `supabase/migrations/00001_baseline.sql` — `settings jsonb not null default '{}'`.

**Claim:** No current writer (`grep -rn settings lib/ app/`), no shape, readable by
staff and (per D1) customers — a standing place to accidentally put secrets.

**Fix:** `comment on column breweries.settings is 'never store secrets here'` or
drop the column until a real use exists.

### Verified sound (database)

- Every public table has RLS; every view is `security_invoker`; only
  `brewery_counters` is policy-less (reached only via the owner-run `set_doc_no` → `next_no` path).
- Every application function pins `search_path`.
- `private.integration_tokens` and its RPCs are unreachable by `anon`/`authenticated`.
- Composite tenant FKs block cross-brewery references (traced `create_replenishment_order → create_order`).
- `is_authorized_staff_rpc` / `require_authorized_staff_rpc` derive tenant from
  real membership; RLS-filtered subqueries return NULL for foreign ids and fail closed.
- Append-only ledgers (`inventory_movements`, `material_movements`, `keg_events`,
  `transfers`, `volume_adjustments`) have UPDATE/DELETE revoked.

## Application

### A1 — P2: no body-size limit or rate limiting on `/api/command`

**Where:** `app/api/command/route.ts` (`req.json()`).

**Claim:** The single command endpoint accepts unbounded JSON and unlimited
request rates from any authenticated user, including portal customers — a
degradation vector for the shared Postgres instance.

**Evidence:** Not demonstrated by load; code review — no size guard, no throttle,
`proxy.ts` only refreshes sessions.

**Fix:** Cap `req.text()` bytes before parsing; add a per-user/IP limiter
(platform rate limiting or a token bucket) in front of `/api/command`.

### A2 — P2: raw Postgres error text is forwarded to clients

**Where:** `lib/commands/registry.ts` — `unwrap()`.

**Claim:** Any Postgres error becomes `CommandError(error.message)` → HTTP 400
with the message verbatim, leaking table/column/policy names on RLS denials and
unexpected constraint hits.

**Evidence:** Reproduced — brewery-A admin calling `upsert_customer` with
brewery-B's customer id received
`42501 new row violates row-level security policy (USING expression) for table "customers"`.

**Fix:** In `unwrap`, keep the stable CHECK-constraint messages, but map
`42501` / `23503` / `23505` to a generic `CommandError` and log the raw error
server-side (same pattern as the existing generic-500 path).

### A3 — P3: `record_movement` and `set_taproom_par` skip the explicit RPC guard

**Where:** `supabase/migrations/00001_baseline.sql` — both function bodies vs.
every other mutation RPC.

**Claim:** They rely solely on the table RLS policy; the result is still deny,
but the error is an RLS-internals message rather than `permission denied for
<rpc>`, and a future policy edit could widen access without the second backstop
their siblings have.

**Evidence:** Reproduced as `brewer`: RLS violation text on `inventory_movements`
instead of the controlled message.

**Fix:** Add `perform public.require_authorized_staff_rpc(p_brewery, '<rpc>', …)`
at the top of both, matching the other RPCs.

### A4 — P3: no security response headers / CSP

**Where:** `next.config.ts`.

**Claim:** No `headers()`: no CSP, `X-Frame-Options`, HSTS, or
`X-Content-Type-Options`. No XSS sink found (no `dangerouslySetInnerHTML`), so
hardening only.

**Fix:** Add a `headers()` block per `node_modules/next/dist/docs/`.

### A5 — P3: `scripts/seed-dev.ts` has no non-local guard

**Where:** `scripts/seed-dev.ts`.

**Claim:** With hosted `NEXT_PUBLIC_SUPABASE_URL` / service key exported, it
would create `dev@mgr.local` with the published password on that project.

**Fix:** Refuse unless the URL host is `127.0.0.1`/`localhost`, or require an
explicit override flag.

### Verified sound (application)

- `/api/command` bearer-vs-cookie dispatch fails closed on missing/malformed
  tokens; the RLS-bound client is rebuilt per bearer request.
- `runCommand` checks role before Zod validation and before the handler.
- Portal commands derive tenant, customer, source, and price server-side.
- By-id staff queries are tenant-isolated by RLS (`is_staff_of`, `my_customer_ids`).
- `upsert_customer` `ON CONFLICT (id)` cross-tenant hijack attempt rejected (42501), row unchanged.
- `getActiveBrewery` / `getActiveCustomer` only select among the user's real memberships.
- Login/logout have no user-controlled redirect.
- `import_csv`, `invite_*` still fail closed before any write.
- GitHub workflows grant read-only scopes; Claude review skips `dreaming/main`.

## Backlog (mirrored in `.agents/PROGRESS.md`)

| Item | Sev | Summary |
| --- | --- | --- |
| D1 | P1 | Customer-safe `breweries` projection; revoke base-table read from customers |
| D2 | P2 | Gate/revoke `lock_order`, `order_line_price` |
| A1 | P2 | Body-size cap + rate limit on `/api/command` |
| A2 | P2 | Generic client message for 42501/23503/23505 in `unwrap` |
| A3 | P3 | Explicit RPC guard in `record_movement`, `set_taproom_par` |
| A4 | P3 | Security headers / CSP |
| A5 | P3 | Local-only guard in `seed-dev.ts` |
| D3 | P3 | Constrain or drop `breweries.settings` |
