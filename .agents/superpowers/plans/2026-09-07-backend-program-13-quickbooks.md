# Program 13 — QuickBooks invoices-out / payments-back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin connects QBO; sales push an invoice with a durable exact payload; payments come back onto `invoices.paid_at`; portal Pay resolves an Intuit link **at click time** and never stores it.

**Architecture:** Do **not** execute `.agents/superpowers/plans/2026-08-31-slice1c-qbo-ai-chat.md` (blocked: old invoker model). New writers are `security definer` + `claim_command_request`. Tokens only through `lib/supabase/integration-tokens.ts`. External POST uses iron-rule-5-adjacent durable outbound identity: persist payload + `qbo_idempotency_key` **before** fetch; reconcile by that key on retry. Composer is Program 15, not this file.

**Tech Stack:** `fetch` to Intuit (no Intuit SDK). New env: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_AUTH_BASE`, `QBO_API_BASE` in `.env.example`.

**Spec:** UI plan `push_invoice_to_qbo` / `connect_qbo`. Screens: Connect QuickBooks, Mapping conflict, Disconnect, Fix mapping, Accounting, Pay invoice. §16.11 invoice drift columns. Remainder bucket E.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Program 1 invoices exist. Program 9 not required.
- `get_qbo_connection` returns health only. Tests assert `JSON.stringify(result)` has no token substrings.
- `qbo_pushes` append-only; no authenticated table DML.
- Portal Pay: GET an MGR route `/portal/invoices/[id]/pay` that authz's the customer then fetches InvoiceLink and 302s. Never persist the bearer URL.
- TTD HTTP is faked at `lib/qbo.ts` with an injectable `fetch`. Tests never hit Intuit.
- TDD, docs:api, staff + portal guides. New env vars in the same PR.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | `qbo_pushes`, `qbo_sync_token`, `qbo_remote_state` on invoices (§16.11), start/finish RPCs |
| `lib/qbo.ts` | OAuth + Invoice CRUD fetch wrapper |
| `lib/commands/qbo.ts` | connect, disconnect, push, mapping, get health, sync payments |
| `app/(app)/settings/qbo/` | connect/disconnect |
| `app/(app)/invoices/[id]/` | Push button |
| `app/(portal)/portal/invoices/[id]/pay/route.ts` | late-bound redirect |
| `tests/qbo.test.ts` | Proof |

---

### Task 1: Push log + start/finish RPCs

**Files:** baseline, `tests/qbo.test.ts`

**Interfaces:**
- `qbo_pushes (id, brewery_id, invoice_id, idempotency_key, request_payload jsonb not null, response jsonb, status qbo_sync_status, created_at)` append-only
- `start_qbo_push(p_invoice, p_payload, p_request_id)` claims command request, inserts push row, returns push id. Does **not** set invoice `qbo_sync_status` to pushed.
- `finish_qbo_push(p_push, p_status, p_qbo_invoice_id, p_error, p_response, p_request_id)` stamps push + invoice.

- [ ] **Step 1:** start inserts payload copied from invoice `qbo_idempotency_key`; finish `pushed` sets `invoices.qbo_invoice_id`; direct insert 42501; warehouse 403.

- [ ] **Step 2–5:** Commit `feat(qbo): durable push log before any Intuit POST`

---

### Task 2: OAuth connect / disconnect / health

**Files:** `lib/qbo.ts`, `lib/commands/qbo.ts`, settings pages

**Interfaces:**
- `connect_qbo` starts OAuth (returns authorize URL). Callback route stores tokens via `storeIntegrationTokens(ctx, "qbo", …)` after `upsert_qbo_connection` RPC (realm_id, display name).
- `disconnect_qbo` deletes connection (purge trigger already clears tokens).
- `get_qbo_connection` → `{ connected, realmLabel, lastError, paymentsEnabled }` no tokens.

- [ ] **Step 1:** Health JSON has no `access`/`refresh`/`token` keys. Disconnect purges `private.integration_tokens` (existing trigger test pattern in `tests/rls-integration-secrets.test.ts`).

- [ ] **Step 2–5:** Commit `feat(qbo): connect and disconnect through the token boundary`

---

### Task 3: Mappings and `push_invoice_to_qbo`

**Files:** `customers.qbo_customer_id`, `skus.qbo_item_id` already exist? Grep — if columns exist, add remapping RPCs. Command `push_invoice_to_qbo({ invoiceId })` admin/sales: build payload, `start_qbo_push`, fetch, `finish_qbo_push`. Retry same invoice uses same `qbo_idempotency_key`. Mapping conflict screen when Intuit returns a name clash.

- [ ] **Step 1:** Fake fetch records the body; retry does not create a second push with a different idempotency key. Unmapped customer raises a CommandError that the Fix mapping screen copies.

- [ ] **Step 2–5:** Commit `feat(qbo): push invoice with persisted payload and stable idempotency key`

---

### Task 4: Payments back and portal Pay

**Files:** `sync_qbo_payments` (staff-triggered, not a service job), portal pay route

**Interfaces:**
- `sync_qbo_payments` reads tokens as the caller, lists payments, sets `invoices.paid_at` when QBO says paid. Never a background `createAdminClient` job.
- Portal `/portal/invoices/[id]/pay`: `orNotFound` if not the caller's invoice; if `!paymentsEnabled` or no `qbo_invoice_id`, render Payment unavailable; else fetch InvoiceLink and redirect. Log the distinguishing reason server-side.

- [ ] **Step 1:** Foreign customer 404 before any fetch (assert fetch not called). Paid invoice has no Pay button. Fake InvoiceLink empty → Payment unavailable page, 200 not 500.

- [ ] **Step 2–5:** Commit `feat(qbo): payments-back and late-bound portal Pay`

---

### Task 5: Pages, ungate, docs

Ungate QBO screens except venue frames. `bun run docs:api`. Staff + portal guides. Browse connect (sandbox copy), push, pay unavailable.

Commit `docs: QuickBooks screens live`

---

## Validation

```bash
bunx vitest run tests/qbo.test.ts tests/rls-integration-secrets.test.ts tests/commands-portal.test.ts
bunx tsc --noEmit && bun run lint
```

## Acceptance

- [ ] Blocked 1C plan is not used
- [ ] Tokens never in `get_qbo_connection` or client JSON
- [ ] Payload persisted before fetch
- [ ] Pay URL not stored
