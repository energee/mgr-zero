# Slice 1C — QBO Integration + AI Chat Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QuickBooks Online invoices-out / payments-back, and the AI chat composer that turns typed intent into a previewed, explicitly-confirmed registry command.

**Architecture:** QBO is a thin `lib/qbo.ts` fetch wrapper (plain OAuth2, no Intuit SDK) plus registry commands; every push persists its exact payload + the invoice's `qbo_idempotency_key` in an append-only `qbo_pushes` log via security-definer functions before POSTing. The composer is a registry query (`compose_command`) that gives the LLM only `aiExposed` command schemas; the server canonicalizes candidates through `preview_command`; the UI commits only on an explicit verb click.

**Tech Stack:** Next.js App Router, Supabase (Postgres/RLS), Zod, `@anthropic-ai/sdk` (**new dependency — approving this plan approves adding it**; QBO uses plain `fetch`, no new dep).

**Spec:** `.agents/superpowers/specs/2026-08-30-mgr-slice1-core-orders-design.md` (§ slice 1 QBO scope), `.agents/superpowers/specs/2026-08-31-mgr-slice1b-orders-design.md` (defers QBO push + AI chat to 1C), `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md` §2 (composer contract, QBO command rows).

## Global Constraints

- Every domain operation is a registry command/query dispatched through `app/api/command/route.ts`; no business logic in routes/pages (iron rule 1).
- Every multi-row write is one plpgsql function (iron rule 5). Edit `supabase/migrations/00001_baseline.sql` in place + `npx supabase db reset`; never a second migration file.
- Composer contract (UI plan §2): server (`preview_command`), not the model, canonicalizes; previews never invent document numbers ("assigned on commit"); every AI write waits for an explicit click on its verb; no auto-commit setting; composer history is device-local.
- `push_invoice_to_qbo` (UI plan): persist exact payload + stable request ID **before** POST; uncertain response reconciles by the same ID before retry; online only.
- `connect_qbo`: durable OAuth after admin permission check; `get_qbo_connection` returns health only, **never tokens**.
- Mappings are explicit single-row remaps: `qbo_customer_id` on `customers`, `qbo_item_id` on `skus`.
- Prove everything: `npx vitest run && npx tsc --noEmit && npm run lint`; tests hit real local Supabase, never mocks of the DB (external QBO/Anthropic HTTP is faked at the process boundary).
- New env vars (add to `.env.example` + README in the task that introduces each): `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_AUTH_BASE`, `QBO_API_BASE`, `ANTHROPIC_API_KEY`.

## Dependencies on slice 1B

Almost none — `invoices`, `qbo_connections`, and the mapping columns already exist in `00001_baseline.sql`; tests seed invoice rows directly. Only Task 10's "push" button placement on the 1B invoice screens and the portal composer entry wait for 1B UI; both are marked below.

## Parallelism

- Track A (QBO): Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 (sequential within track; 4 can run parallel to 3).
- Track B (Composer): Tasks 8 → 9 → 10 (sequential within track).
- Tracks A and B are fully independent of each other. Task 11 (docs/validation) last.

---

### Task 1: `qbo_pushes` append-only log + definer functions

**Files:**
- Modify: `supabase/migrations/00001_baseline.sql` (integrations section, after `qbo_connections`)
- Test: `tests/qbo-push-log.test.ts`

**Interfaces:**
- Produces: table `qbo_pushes`; plpgsql `start_qbo_push(p_invoice_id uuid, p_payload jsonb) returns uuid` and `finish_qbo_push(p_push_id uuid, p_status qbo_sync_status, p_qbo_invoice_id text, p_error text, p_response jsonb)` — both security definer, both stamp the parent invoice's `qbo_sync_status`.

- [ ] **Step 1: Write the failing test** (`tests/qbo-push-log.test.ts`, copy setup style from `tests/write-atomicity.test.ts` / `tests/helpers.ts`): seed brewery + customer + invoice; `rpc('start_qbo_push', {p_invoice_id, p_payload})` returns a push id, invoice `qbo_sync_status` unchanged (`pending`), `qbo_pushes` row has the payload and the invoice's `qbo_idempotency_key`; `rpc('finish_qbo_push', {…status:'pushed', p_qbo_invoice_id:'123'})` sets push row + invoice `qbo_sync_status='pushed'`, `qbo_invoice_id='123'`; direct `update`/`delete` on `qbo_pushes` as authenticated user fails (append-only, like `inventory_movements`); cross-tenant `start_qbo_push` fails.
- [ ] **Step 2: Run** `npx vitest run tests/qbo-push-log.test.ts` — expect FAIL (function does not exist).
- [ ] **Step 3: Implement** in the baseline (mirroring the existing append-only ledger conventions — composite FK, no UPDATE/DELETE grants, definer fns with `revoke`/`grant execute to authenticated`):

```sql
create table qbo_pushes (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  invoice_id uuid not null,
  idempotency_key uuid not null,        -- copied from invoices.qbo_idempotency_key
  request_payload jsonb not null,       -- exact body persisted BEFORE the POST
  response jsonb,
  status qbo_sync_status not null default 'pending',
  qbo_invoice_id text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (invoice_id, brewery_id) references invoices (id, brewery_id)
);
create index qbo_pushes_invoice_idx on qbo_pushes (invoice_id, created_at desc);
alter table qbo_pushes enable row level security;
create policy qbo_pushes_read on qbo_pushes for select
  using (is_member(brewery_id));
revoke insert, update, delete on qbo_pushes from authenticated;

create or replace function start_qbo_push(p_invoice_id uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_push_id uuid;
begin
  insert into qbo_pushes (brewery_id, invoice_id, idempotency_key, request_payload)
  select i.brewery_id, i.id, i.qbo_idempotency_key, p_payload
  from invoices i where i.id = p_invoice_id and is_member(i.brewery_id)
  returning id into v_push_id;
  if v_push_id is null then raise exception 'invoice not found'; end if;
  return v_push_id;
end $$;

create or replace function finish_qbo_push(
  p_push_id uuid, p_status qbo_sync_status,
  p_qbo_invoice_id text default null, p_error text default null, p_response jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_invoice_id uuid;
begin
  update qbo_pushes set status = p_status, qbo_invoice_id = p_qbo_invoice_id,
         error = p_error, response = p_response, finished_at = now()
  where id = p_push_id and is_member(brewery_id)
  returning invoice_id into v_invoice_id;
  if v_invoice_id is null then raise exception 'push not found'; end if;
  update invoices set qbo_sync_status = p_status, qbo_sync_error = p_error,
         qbo_invoice_id = coalesce(p_qbo_invoice_id, qbo_invoice_id)
  where id = v_invoice_id;
end $$;
revoke all on function start_qbo_push(uuid, jsonb) from public;
grant execute on function start_qbo_push(uuid, jsonb) to authenticated;
revoke all on function finish_qbo_push(uuid, qbo_sync_status, text, text, jsonb) from public;
grant execute on function finish_qbo_push(uuid, qbo_sync_status, text, text, jsonb) to authenticated;
```

Before writing, grep the baseline for the membership-check helper's exact name (`is_member` assumed here) and copy the file's grant/revoke idiom; if the helper differs, use the file's name.
- [ ] **Step 4:** `npx supabase db reset`, then `npx vitest run tests/qbo-push-log.test.ts` — PASS; also `npx vitest run tests/schema-conventions.test.ts` (append-only + composite-FK conventions must still hold; extend that test's table list if it enumerates ledgers).
- [ ] **Step 5: Commit** `feat(1c): qbo_pushes append-only push log + start/finish definer fns`

### Task 2: `lib/qbo.ts` — OAuth token refresh + API wrapper

**Files:**
- Create: `lib/qbo.ts`
- Create: `tests/fake-qbo.ts` (shared fake Intuit server helper)
- Test: `tests/qbo-client.test.ts`

**Interfaces:**
- Produces: `getQboConnection(ctx): Promise<QboConnection | null>` (row from `qbo_connections`); `qboFetch(ctx, path: string, init?: RequestInit): Promise<Response>` — loads the connection, refreshes the access token via `${QBO_AUTH_BASE}/oauth2/v1/tokens/bearer` when `access_expires_at` is within 60s, persists rotated tokens, then calls `${QBO_API_BASE}/v3/company/{realm_id}${path}`; throws `CommandError("QBO not connected")` when no row. Also `startFakeQbo()` in `tests/fake-qbo.ts`: a `node:http` server that records requests, answers the token endpoint with fresh tokens and `/v3/company/:realm/*` with configurable canned JSON.
- Consumes: env `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_AUTH_BASE`, `QBO_API_BASE`.

- [ ] **Step 1: Write the failing test.** Point `QBO_AUTH_BASE`/`QBO_API_BASE` at `startFakeQbo()` via `process.env`. Cases: no connection row → throws "QBO not connected"; expired `access_expires_at` → refresh endpoint hit once, new tokens persisted to `qbo_connections`, API call carries the new bearer; unexpired → refresh not hit.
- [ ] **Step 2:** `npx vitest run tests/qbo-client.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement `lib/qbo.ts`** (module comment: "QBO OAuth2 + API fetch wrapper; tokens live only in `qbo_connections`, never returned to clients"). Plain `fetch`; `Authorization: Basic base64(client_id:client_secret)` for refresh, `Bearer` for API; persist rotated tokens with `ctx.db.from("qbo_connections").update(...)`.
- [ ] **Step 4:** `npx vitest run tests/qbo-client.test.ts` — PASS.
- [ ] **Step 5:** Add the four QBO env vars to `.env.example` (Intuit sandbox URLs as defaults: `https://oauth.platform.intuit.com` / `https://sandbox-quickbooks.api.intuit.com`) and a README env-table row. **Commit** `feat(1c): qbo fetch wrapper with token refresh`

### Task 3: `connect_qbo` OAuth flow + `get_qbo_connection`

**Files:**
- Create: `lib/commands/qbo.ts`, `app/api/qbo/callback/route.ts`
- Modify: `lib/commands/all.ts` (add `import "./qbo";`), `lib/qbo.ts` (state helpers)
- Test: `tests/commands-qbo.test.ts`

**Interfaces:**
- Produces: command `connect_qbo` (roles `["admin"]`, input `z.object({})`) → `{ authorizeUrl: string }`; query `get_qbo_connection` (roles `["admin","sales"]`) → `{ connected: boolean, realmId: string | null, connectedAt: string | null }` — never tokens; `buildAuthorizeUrl(breweryId, userId): string` and `verifyState(state): { breweryId, userId } | null` in `lib/qbo.ts` (state = HMAC-signed with `QBO_CLIENT_SECRET`; no new table); callback route exchanges `code`, upserts `qbo_connections` (`on conflict (brewery_id)`), redirects to `/settings/integrations?qbo=connected|error`.
- Consumes: Task 2 env + wrapper.

- [ ] **Step 1: Failing tests** (use `runCommand` with a built `Ctx`, like `tests/commands-inventory.test.ts`): `connect_qbo` as admin returns an `authorizeUrl` containing `client_id`, `redirect_uri`, `state`, scope `com.intuit.quickbooks.accounting`; as `sales` → permission denied; `verifyState(buildAuthorizeUrl-state)` round-trips and a tampered state returns null; `get_qbo_connection` with no row → `{connected:false,…}`; after inserting a row with tokens → `connected:true` and `JSON.stringify(result)` contains no token material.
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement.** The callback route is thin glue over `verifyState` + token exchange + upsert; it is a platform OAuth boundary like the Auth routes — note that in a route comment citing `.agents/ARCHITECTURE.md` iron rule 1's Auth exception.
- [ ] **Step 4:** run — PASS.
- [ ] **Step 5: Commit** `feat(1c): connect_qbo oauth start/callback + get_qbo_connection health query`

### Task 4: QBO mappings

**Files:**
- Modify: `lib/commands/qbo.ts`
- Test: `tests/commands-qbo.test.ts` (extend)

**Interfaces:**
- Produces: `set_qbo_customer_mapping` (roles `["admin","sales"]`, input `{ customerId: z.string().uuid(), qboCustomerId: z.string().nullable() }`) — single-row update of `customers.qbo_customer_id`; `set_qbo_item_mapping` (same roles, `{ skuId, qboItemId }` same shapes) → `skus.qbo_item_id`; query `get_qbo_mapping_candidates` (roles `["admin","sales"]`, input `{}`) → `{ customers: [{id, name, qboCustomerId}], skus: [{id, name, qboItemId}], qbo: { customers: [{id, name}], items: [{id, name}] } }` where the `qbo` half comes from `qboFetch` (`/query?query=select * from Customer` / `Item`).
- Consumes: `qboFetch` (Task 2).

- [ ] **Step 1: Failing tests**: each mapping command updates the row (null clears it); cross-tenant id → error/no-op; `get_qbo_mapping_candidates` against the fake QBO returns merged local + remote lists.
- [ ] **Step 2:** run — FAIL. **Step 3:** implement (each mapping is one `unwrap(ctx.db.from(...).update(...).eq("id", …).eq("brewery_id", ctx.breweryId).select().single())`). **Step 4:** run — PASS. **Step 5: Commit** `feat(1c): qbo customer/item mappings + mapping candidates query`

### Task 5: `push_invoice_to_qbo`

**Files:**
- Modify: `lib/commands/qbo.ts`
- Test: `tests/commands-qbo.test.ts` (extend, using `tests/fake-qbo.ts`)

**Interfaces:**
- Produces: command `push_invoice_to_qbo` (roles `["admin","sales"]`, `requiresConfirmation: true`, input `{ invoiceId: z.string().uuid() }`) → `{ pushId: string, qboInvoiceId: string | null, status: "pushed" | "push_failed" }`.
- Consumes: `start_qbo_push`/`finish_qbo_push` (Task 1), `qboFetch` (Task 2), mappings (Task 4).

Handler order (the ordering is the spec's durability requirement — payload persisted before POST):
1. Load invoice + lines + customer; refuse if `qbo_sync_status = 'pushed'`, if the customer lacks `qbo_customer_id`, or any line's SKU lacks `qbo_item_id` (name the missing mappings in the error).
2. Build the QBO Invoice JSON (credit memos → QBO `CreditMemo` entity; lines map qty × `unit_price_cents`/100 with `SalesItemLineDetail.ItemRef = qbo_item_id`).
3. `rpc('start_qbo_push', { p_invoice_id, p_payload })` — payload durably persisted.
4. POST `/invoice` (or `/creditmemo`) via `qboFetch` with header `Request-Id: <qbo_idempotency_key>` (Intuit's idempotency header — retries with the same ID dedupe server-side).
5. On 2xx: `finish_qbo_push(status:'pushed', qbo_invoice_id, response)`. On definite 4xx: `finish_qbo_push(status:'push_failed', error)`. On network/uncertain failure: **reconcile before failing** — query QBO by the same Request-Id/DocNumber; if found, finish as pushed; else `push_failed` with the error.

- [ ] **Step 1: Failing tests**: happy path (seed mapped customer/SKU + invoice + lines → status `pushed`, `qbo_invoice_id` set, `qbo_pushes` row holds the exact posted payload, and fake-QBO's recorded request carries `Request-Id` equal to the invoice's `qbo_idempotency_key`); unmapped SKU → CommandError naming it and no `qbo_pushes` row (guard runs before `start_qbo_push`); QBO 400 → `push_failed` + error persisted on invoice and push row; second push of a `pushed` invoice → refused; retry after `push_failed` → new `qbo_pushes` row, same idempotency key.
- [ ] **Step 2:** run — FAIL. **Step 3:** implement. **Step 4:** run — PASS. **Step 5: Commit** `feat(1c): push_invoice_to_qbo with durable payload + idempotent retry`

### Task 6: `sync_qbo_payments` (payments-back)

**Files:**
- Modify: `lib/commands/qbo.ts`, `supabase/migrations/00001_baseline.sql` (one definer fn)
- Test: `tests/commands-qbo.test.ts` (extend)

**Interfaces:**
- Produces: command `sync_qbo_payments` (roles `["admin","sales"]`, input `{}`) → `{ updated: number }`; baseline definer fn `apply_qbo_invoice_state(p_invoice_id uuid, p_tax_cents int, p_total_cents int, p_balance_cents int, p_paid_at timestamptz) returns void` — the single writer of the "written by the sync job only" columns (`qbo_tax_cents/qbo_total_cents/qbo_balance_cents/paid_at`), same definer/grant idiom as Task 1.

- [ ] **Step 1: Failing tests**: seed two `pushed` invoices with `qbo_invoice_id`; fake QBO query response marks one `Balance: 0` → that invoice gets `paid_at` set and `qbo_balance_cents = 0`, the other untouched; nonzero balance → `qbo_balance_cents` updated, `paid_at` stays null.
- [ ] **Step 2:** run — FAIL. **Step 3:** implement: select `pushed` invoices with a `qbo_invoice_id`, batch-fetch `/query?query=select Id, Balance, TotalAmt, TxnTaxDetail from Invoice where Id in (…)`, call `apply_qbo_invoice_state` per changed invoice. `npx supabase db reset` after the baseline edit. **Step 4:** full `npx vitest run` — PASS. **Step 5: Commit** `feat(1c): sync_qbo_payments payments-back`

### Task 7: QBO UI — Integrations screen + Today failure row

**Files:**
- Create: `app/(app)/settings/integrations/page.tsx`, `app/(app)/settings/integrations/qbo-panel.tsx`
- Modify: `app/(app)/page.tsx` (Today: "QBO failures" row)
- Test: rendered-page check (manual, per operating loop step 3) — tests don't cover rendering.

**Interfaces:**
- Consumes: `get_qbo_connection`, `connect_qbo`, `get_qbo_mapping_candidates`, `set_qbo_customer_mapping`, `set_qbo_item_mapping`, `push_invoice_to_qbo` via the existing client command caller (`lib/commands/client.ts`; follow `app/(app)/settings/team` as the pattern).

- [ ] **Step 1:** Build the panel: connection status (realm shown when connected / "Connect QuickBooks" button → `connect_qbo` → redirect to `authorizeUrl`), two mapping tables (local name → `<select>` of QBO candidates → save on change), and an unsynced/failed list (`qbo_sync_status <> 'pushed'`) with per-row **Push to QuickBooks** button and last error text. External write → confirmation `AlertDialog` before push (copper risk per the UI plan).
- [ ] **Step 2:** Today row: count of `push_failed` invoices linking to the integrations screen, admin/sales roles only.
- [ ] **Step 3:** Look at the rendered pages against local Supabase with a seeded failed push; fix what's broken. `npx tsc --noEmit && npm run lint`.
- [ ] **Step 4: Commit** `feat(1c): QBO integrations screen + Today failure row`
- **1B note:** when 1B's invoice list/detail screens land, they add their own Push button calling the same command — a one-line follow-up in the 1B UI work, not blocked here.

### Task 8: Registry — `aiExposed` flag + `preview_command`

**Files:**
- Modify: `lib/commands/registry.ts`, existing `lib/commands/{catalog,inventory}.ts` (tag safe defs), `lib/commands/all.ts`
- Create: `lib/commands/preview.ts`
- Test: `tests/registry.test.ts` (extend), `tests/commands-preview.test.ts`

**Interfaces:**
- Produces: `Def` gains `aiExposed?: boolean` (default false) and optional `preview?: (ctx: Ctx, input: In) => Promise<Record<string, unknown>>`; `listTools(opts?: { aiOnly?: boolean })` filters to tagged defs; exported `getCommand(name: string)`; query `preview_command` (roles `"any"`, input `{ command: z.string(), input: z.unknown() }`, **not aiExposed**) → `{ name, description, requiresConfirmation, valid: boolean, errors: string[] | null, canonical: unknown, preview: Record<string, unknown> | null, allowed: boolean }`. It runs `safeParse`, the role check, and the optional `preview` hook; it **never** calls `handler`.
- Consumes: nothing new.

- [ ] **Step 1: Failing tests**: `listTools({aiOnly:true})` excludes untagged commands and `preview_command` itself; valid `create_product` input → `valid:true`, `canonical` = Zod-parsed input, `requiresConfirmation` echoed; invalid input → `valid:false` with messages and nothing written to the DB; a command the ctx role can't run → `allowed:false`; `preview` is null when the def has no hook (previews never invent document numbers — numbers only exist post-commit).
- [ ] **Step 2:** run — FAIL. **Step 3:** implement; tag `aiExposed: true` on the hop-green set only: catalog CRUD commands/queries, `record_movement`, `get_on_hand`, `get_atp`, `list_movements`. Leave invites, import, and everything copper/gated untagged (1B commands tag themselves when they land).
- [ ] **Step 4:** run — PASS. **Step 5: Commit** `feat(1c): aiExposed registry flag + preview_command canonical preview`

### Task 9: `compose_command` — LLM intent → candidate

**Files:**
- Create: `lib/commands/compose.ts`
- Modify: `lib/commands/all.ts`, `package.json` (add `@anthropic-ai/sdk`), `.env.example` (+`ANTHROPIC_API_KEY`), README env table
- Test: `tests/commands-compose.test.ts`

**Interfaces:**
- Produces: query `compose_command` (roles `"any"`, input `{ text: z.string().min(1) }`) → `{ candidate: { command: string, input: unknown } | null, message: string }`; test hook `_setModelClient(fake)` mirroring the `_clearRegistry` convention.
- Consumes: `listTools({aiOnly:true})` (Task 8), filtered again to the ctx role's runnable set; Zod → JSON Schema via Zod 4's built-in `z.toJSONSchema`.
- Model call: one Anthropic Messages request, model `claude-sonnet-5`, `tool_choice: {type:"auto"}`, system prompt: "Propose exactly one registered command for the user's intent, or reply asking for the missing field. Never invent quantities, sources, or destinations." A returned `tool_use` block becomes `candidate` verbatim — the server does not trust it; the UI must run it through `preview_command` before showing a proposal.

- [ ] **Step 1: Failing tests** (stubbed client only — never the network): stub returns `tool_use` for `create_product` → `candidate` carries it; stub returns plain text → `candidate:null`, `message` set; a `customer`-role ctx's captured request contains no staff-only tools; `compose_command` and `preview_command` are absent from the tool list.
- [ ] **Step 2:** run — FAIL. **Step 3:** `npm i @anthropic-ai/sdk` (approved via this plan), implement. **Step 4:** run — PASS, plus `npx tsc --noEmit`. **Step 5: Commit** `feat(1c): compose_command LLM intent-to-candidate with role-filtered tools`

### Task 10: Composer UI (staff shell)

**Files:**
- Create: `app/(app)/composer.tsx`
- Modify: `app/(app)/page.tsx` (mount at bottom of Today), `app/(app)/layout.tsx` (⌘K on desktop)
- Test: rendered-page check (manual).

**Interfaces:**
- Consumes: `compose_command` → `preview_command` → normal client `runCommand` call on explicit confirm.

Flow (UI plan §2 verbatim requirements): text → `compose_command`; if candidate, `preview_command`; proposal card shows every field that will be written plus warnings, with any document number labelled "assigned on commit"; primary button is the command's verb (e.g. **Create product**), plus **Open as form** (deep-link to the owning form prefilled via query params where the form exists; omit otherwise) and **Dismiss**; `requiresConfirmation` commands additionally get the `AlertDialog`. No auto-commit code path exists. History: last 20 entries in `localStorage` behind a visible **History** button (device-local per the plan), reads/writes wrapped in try/catch.

- [ ] **Step 1:** Build it.
- [ ] **Step 2:** Look at the rendered flow against local Supabase with `ANTHROPIC_API_KEY` set: type "new product called Haze King, 6.8%", confirm the write happens only on the verb click, and an ambiguous intent shows the model's clarifying message. `npx tsc --noEmit && npm run lint`.
- [ ] **Step 3: Commit** `feat(1c): chat composer — compose → preview → explicit-verb commit`
- **1B note:** the portal composer (restricted to the customer's catalog/orders, UI plan §3) reuses this component inside the 1B portal shell — deferred until `/portal` exists; Tasks 8–9's role filtering already enforces the data boundary.

### Task 11: Docs + final validation

**Files:**
- Modify: `.agents/ARCHITECTURE.md` (ownership rows for `lib/qbo.ts`, `lib/commands/{qbo,preview,compose}.ts`, `app/api/qbo/callback`; note the compose→preview→commit contract is now implemented), `README.md` (verify env table complete), `.agents/PROGRESS.md`; `2026-08-31-mgr-wireframes.html` only if the built Integrations/composer screens diverged from their frames (wireframes stay in step with the plan).

- [ ] **Step 1:** Full gate: `npx vitest run && npx tsc --noEmit && npm run lint`; `git diff` review (NUL-byte check); one from-scratch `npx supabase db reset` to prove the baseline replays.
- [ ] **Step 2:** Update the docs above; verify every new file carries its module-level comment.
- [ ] **Step 3: Commit** `docs(1c): architecture/progress updates for QBO + composer`

---

## Self-review notes

- Spec coverage: UI-plan rows `connect_qbo` (T3), `set_qbo_customer_mapping`/`set_qbo_item_mapping` (T4), `push_invoice_to_qbo` incl. persist-before-POST + reconcile-by-ID (T5), `get_qbo_connection` health-only (T3), `get_qbo_mapping_candidates` (T4), payments-back from the parent spec (T6), composer contract §2 (T8–T10), Today "QBO failures" row (T7). Deliberately out, per the specs: `connect_square` (slice 7), QBO disconnect commands (`compensation: null` until exact disconnect commands exist), server-owned composer history (device-local until a schema exists), voice transport.
- `qbo_pushes.status` reuses the `qbo_sync_status` enum — one vocabulary, `pending → pushed | push_failed` matching the invoice column.
- Type consistency: `start_qbo_push(p_invoice_id, p_payload) → uuid` identical in T1/T5; `listTools({aiOnly})` in T8/T9; `Ctx` unchanged throughout.
