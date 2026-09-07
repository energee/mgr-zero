# Program 11 — Provisioning, invites, and import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three ARCHITECTURE access gates with tests that **force failure after the external step**, then ungate Create brewery, Accept invite, Invite portal user, Import, and the first-run invite/import rows.

**Architecture:** Durable request identity in Postgres **before** calling Supabase Auth. An incomplete second step is recoverable. Import: one RPC per logical CSV row; reruns return the first result. No `createAdminClient` outside the existing allowlist — invites use Auth admin **only** from a new `lib/auth/invites.ts` that is added to the eslint allowlist the way `lib/chat/jobs.ts` is, **or** a dedicated `lib/supabase/invites.ts` next to `integration-tokens.ts`. Prefer mirroring the token-boundary pattern: visible membership check on `ctx.db`, then one service RPC.

**Tech Stack:** Same as Program 1. Mailpit already in CI for invite email.

**Spec:** `.agents/ARCHITECTURE.md` Pre-implementation gates (invites, import, pre-tenant provision). Screens: Create brewery, Accept invite, Expired invite, Invite portal user, Import, Team gated button. Parent remainder index bucket C.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Program 10 Team page exists so Invite can be ungated in place.
- Tests **must** inject a failure between Auth user create and membership insert (staff and customer). A green path alone does not close the gate.
- `provision_brewery` is pre-tenant: no `breweryId` on the command. Needs an explicit pre-tenant context in `buildContext` (ARCHITECTURE iron rule 1). Do not fake a brewery id.
- Import kinds stay `customers | ship_tos | products_skus | price_list_items | opening_balances`. After Program 3, `products_skus` means brands+formats+skus. Opening balances use `record_inventory_movement` with `binId` (Program 2).
- TDD, docs:api, staff-guide, eslint allowlist change is in the same PR as the invite module.
- Ask before adding papaparse back; CSV parse may be a small `split` + header row in the command input (rows already `z.array(z.record(...))` — the **browser** maps the file. No new dependency required).

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | `private.invite_requests`, `provision_brewery` RPC, per-row import RPCs |
| `lib/supabase/invites.ts` | the one Auth-admin owner (eslint allowlist) |
| `lib/commands/invites.ts` | replace fail-closed handlers |
| `lib/commands/import.ts` | replace fail-closed handler |
| `lib/commands/context.ts` | pre-tenant ctx for provision |
| `eslint.config.mjs` | allowlist `lib/supabase/invites.ts` |
| `tests/commands-invites.test.ts`, `tests/commands-import.test.ts`, `tests/provision.test.ts` | gate proofs |
| `app/(auth)/` | Accept invite, Create brewery |
| `app/(app)/settings/import/page.tsx` | Import wizard |

---

### Task 1: Invite request ledger + forced Auth-then-fail

**Files:** baseline `private.invite_requests`, `lib/supabase/invites.ts`, `lib/commands/invites.ts`, `eslint.config.mjs`, tests

**Interfaces:**
- Table: `invite_requests (id uuid pk, brewery_id, email, role staff_role null, customer_id uuid null, kind text check in ('staff','customer'), auth_user_id uuid, state text check in ('pending_auth','pending_membership','complete','failed'), request_id uuid unique, last_error text, created_at)`
- `invite_staff({ email, role })` admin: insert pending_auth with `request_id`, call Auth invite, on Auth success write `auth_user_id` and `pending_membership`, insert `brewery_users`, mark complete. On membership failure leave `pending_membership` so retry with the **same requestId** skips Auth and only inserts membership.
- `invite_customer_user({ email, customerId })` same shape with `customer_users`.

- [ ] **Step 1:** In `tests/commands-invites.test.ts`:

```ts
it("retry after Auth success and membership failure does not create a second Auth user", async () => {
  // inject: first membership insert raises (spy on rpc or a test-only hook).
  // Practical approach: call a test RPC invite_staff_fault_after_auth once,
  // assert one auth.users row; then invite_staff with the same requestId completes membership.
});
```

The clean way without spies: `invite_staff` is two RPCs internally forbidden — it must be **one command, two steps inside `lib/supabase/invites.ts`**: (1) `claim_invite_request` RPC, (2) Auth, (3) `complete_invite_membership` RPC. Test calls (1)+(2) then aborts before (3) by exporting `inviteStaffSteps` for tests **or** a `p_fault text` only when `tests/helpers.ts` sets a GUC. **Do not add a p_fault to production RPCs.**

Preferred: export

```ts
export async function inviteStaff(ctx, input, execution, hooks = { afterAuth: async () => {} })
```

Production handler uses default hooks. Test passes `afterAuth: () => { throw new Error("injected") }`, then retries `invite_staff` with same `requestId` and asserts `auth.admin.listUsers` count unchanged and `brewery_users` exists.

- [ ] **Step 2:** FAIL — handler still throw "not available".

- [ ] **Step 3:** Implement ledger + steps. Last admin / duplicate email: CommandError. Mailpit receives the invite (CI already has mailpit).

- [ ] **Step 4:** Same test for `invite_customer_user`.

- [ ] **Step 5:** Commit `feat(invites): durable Auth-then-membership with forced-failure proof`

---

### Task 2: Accept invite and expired invite pages

**Files:** `app/(auth)/` accept + expired screens matching records; `tests/commands-invites.test.ts` for token consumed.

- [ ] **Step 1:** After invite, hash from mailpit (or Auth generateLink in test) completes membership; reused token shows Expired invite record.

- [ ] **Step 2–5:** Commit `feat(auth): accept and expired invite pages`

---

### Task 3: `provision_brewery`

**Files:** `lib/commands/context.ts` pre-tenant, baseline RPC, `app/(auth)/create-brewery/page.tsx`

**Interfaces:**
- `buildContext` without brewery: `{ userId, role: null, breweryId: null }` only allowed to call `provision_brewery`.
- RPC `provision_brewery(p_name, p_timezone, p_ttb, p_request_id)` security definer: insert brewery + admin `brewery_users` for `auth.uid()` in one function. No RLS bootstrap via client insert.
- Dedicated-mode: if `process.env.MGR_DEDICATED === "1"` the page is not linked (hidden). Still testable.

- [ ] **Step 1:** User with no membership calls `provision_brewery`; gets brewery + admin row; second call with same requestId returns same id; different payload conflicts.

- [ ] **Step 2–5:** Commit `feat(tenancy): provision_brewery creates brewery and first admin atomically`

---

### Task 4: `import_csv` per logical row

**Files:** `lib/commands/import.ts`, one RPC per kind per row (or one `import_csv_row(kind, row, request_id, row_n)`)

**Interfaces:**
- Command still accepts `{ kind, rows }` but the handler loops `row_n` and calls `import_csv_row` **once per row**. Each call has `request_id = uuidv8(hash(parentRequestId, row_n))` durable in `private.command_requests`. Opening-balance row that reruns returns the first movement id, does not append.
- A blocked row (missing ship-to) does not abort siblings (`// atomic-exempt:` on the loop, not inside a row).

- [ ] **Step 1:** Two customer rows, second invalid; first committed; rerun same parent requestId + rows does not duplicate the first customer. Opening balance rerun does not add a second movement.

- [ ] **Step 2:** FAIL — still fail-closed.

- [ ] **Step 3:** Implement. Map `products_skus` through `upsert_brand` + `create_sku` (Program 3 names). Opening balance requires `locationId`+`binId` columns in the CSV map UI.

- [ ] **Step 4–5:** Import wizard page matching Import screen (steps upload/map/preview/commit). Commit `feat(import): per-row RPC and durable rerun`

---

### Task 5: Ungate screens, first-run, docs

Team Invite staff enabled. Invite portal user on customer detail. Import under Settings. Create brewery in SaaS entry. First-run invite/import rows live. `bun run docs:api`. Staff-guide. Browse.

Commit `docs: invites, import, and provision screens live`

---

## Validation

```bash
bunx vitest run tests/commands-invites.test.ts tests/commands-import.test.ts tests/provision.test.ts tests/app-screen-parity.test.ts
bunx tsc --noEmit && bun run lint
```

The invite tests must include the injected Auth-success/membership-failure path or this program is not done.

## Acceptance

- [ ] Forced-failure retry does not duplicate Auth users
- [ ] Opening-balance rerun does not duplicate movements
- [ ] `provision_brewery` is one RPC, pre-tenant
- [ ] eslint still blocks `createAdminClient` except tokens, chat jobs, and `lib/supabase/invites.ts`
