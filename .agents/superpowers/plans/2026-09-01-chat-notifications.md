# Slack-First Chat Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Slack-first, provider-portable projection of MGR Today through private App Home, personal DMs, one private operations digest, integration-owned preferences, and a production preview gallery.

**Architecture:** MGR owns tenant identity, Today reasons, occurrences, destinations, preferences, retries, and audit in provider-neutral tables. Vercel Chat SDK owns Slack webhook/OAuth normalization and isolated Postgres operational state. Slack is projection-only in this plan: every operational button deep-links to authenticated MGR; fermentation and order forms appear only as disabled previews.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, TypeScript 5, Supabase/Postgres/RLS, Vitest 4, Vercel Chat SDK 4.39, `@chat-adapter/slack`, `@chat-adapter/state-pg`, `pg`, agent-browser.

**Spec:** `.agents/superpowers/specs/2026-09-01-mgr-chat-notifications-design.md`

## Global Constraints

- Work only in `.agents/worktrees/plan-chat-notifications` on branch `plan/chat-notifications`.
- Run `pwd`, `git branch --show-current`, and `git status --short` before the first edit and before every commit.
- Task 1 must prove that Chat SDK runtime DDL is confined to private `chat_sdk`: the dedicated role may `CREATE` only there and must remain unable to access MGR public tenant data or any other application schema.
- Edit `supabase/migrations/00001_baseline.sql` in place; do not add a second migration.
- Every tenant table carries `brewery_id`, `unique (id, brewery_id)`, tenant-safe composite foreign keys, and RLS.
- Every multi-row user action is one Postgres RPC.
- Service-role access is limited to named chat-job functions and private integration state. It never impersonates a staff user or invokes ordinary domain commands.
- `CHAT_STATE_DATABASE_URL` authenticates as a dedicated login member of `mgr_chat_sdk`; it never uses the Supabase owner, `postgres`, `anon`, `authenticated`, or `service_role` database credentials.
- Slack callbacks prove transport authenticity only. Brewery and user identity resolve through active server-side mappings.
- Public, archived, externally shared, and Slack Connect destinations fail closed.
- Shared output contains counts and safe operational labels only. Personal output excludes contacts, prices, license numbers, signatures, notes, credentials, and raw errors.
- Delivery is at-least-once with semantic deduplication. Never claim exactly-once Slack delivery.
- Brewery quiet hours delay every first-release DM; no event bypass exists.
- Fermentation overdue cadence is an MGR operating default: integer 1–168 hours, default 24, shared by Today and every provider.
- Morning and midday digests use fixed brewery-local windows beginning at 08:00 and 12:00 in this release.
- Production previews use committed fixture data, make no provider call, and query no live tenant subjects.
- No operational Slack mutation ships in this plan. Slack actions for `record_fermentation_reading` and `confirm_order` remain disabled previews even when the corresponding MGR pages exist.
- New files include a one-line module-purpose comment.
- After each task, run its named Vitest file and `npx tsc --noEmit`. Final verification is `npx vitest run && npx tsc --noEmit && npm run lint && npm run build` plus the browser smoke.

## Scope boundary

This plan implements design stages 0–3: compatibility, provider-neutral foundation, four Today projections, Slack delivery, integration-owned preferences, health controls, and production previews. It does not implement delegated RLS actor credentials, domain-command replay, fermentation entry, or order confirmation. Those require separate approved specs after the launch metrics and trust gates pass.

## Domain prerequisites

Tasks 1–6 and the fixture preview work can execute against the current branch. Task 7 and every delivery task after it require the owning MGR destinations to exist:

- order review/pick: current `app/(app)/orders/[id]/page.tsx` and registered order commands;
- fermentation reading: `app/(app)/beer/cellar/[occupancyId]/reading/page.tsx`, registered `get_cellar_map`, and registered `record_fermentation_reading`;
- delivery stop: `app/(app)/work/deliveries/[deliveryId]/page.tsx`, registered `get_delivery_stop`, and registered `confirm_delivery`.

The slice-4 cellar and slice-10 delivery plans own those MGR pages/commands. This chat plan does not recreate them. If either prerequisite is absent, keep its reason out of production occurrence scanning and do not claim the four-reason launch complete. The App Home/DM/digest fixtures may still preview the approved target state because they are explicitly labeled preview data.

## File map

### Existing files modified

- `package.json`, `bun.lock` — Chat SDK and Postgres dependencies plus chat browser-smoke script.
- `supabase/migrations/00001_baseline.sql` — cadence field, private adapter schema, provider-neutral tables, RLS, RPCs, occurrence scan, leasing, and atomic submitted-order occurrence.
- `lib/commands/all.ts` — register chat, Today, and brewery-setting definitions.
- `app/(app)/layout.tsx` — add Chat integration settings navigation.
- `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md` — exact new tables/functions.
- `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md` — provider portability, state isolation, dedupe, cadence, and projection-only rationale.
- `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md` — Settings preview gallery and Slack surface ownership.
- `components/mgr/screens.tsx` — the screen inventory, including the Chat frames.
- `.agents/ARCHITECTURE.md` — chat owners, narrow internal-job exception, and provider contract.
- `public/docs/user-guide.html` — customer-facing setup, linking, delivery, quiet hours, privacy, and recovery.
- `README.md` — local Slack app, environment, callback, job, and sandbox setup.
- `.agents/PROGRESS.md` — completed scope and remaining gated forms.

### New production files

- `lib/chat/contracts.ts` — provider-neutral reason, payload, destination, render, and capability types.
- `lib/chat/provider.ts` — provider transport/capability interface used by delivery jobs and conformance tests.
- `lib/chat/preview-fixtures.ts` — committed non-sensitive preview fixture catalog.
- `lib/chat/state.ts` — restricted `pg.Pool` and `createPostgresState` singleton.
- `lib/chat/slack-adapter.ts` — Slack adapter and Chat singleton construction.
- `lib/chat/slack-renderer.ts` — portable payload to Block Kit/App Home rendering.
- `lib/chat/slack-transport.ts` — installation-scoped send/update, destination validation, and rate-limit mapping.
- `lib/chat/oauth.ts` — installation intent, authorize URL, callback completion, reconciliation, and disconnect services.
- `lib/chat/linking.ts` — external-user link proof issue/consume/unlink services.
- `lib/chat/jobs.ts` — scan, lease, revalidate, deliver, retry, and cleanup orchestration.
- `lib/chat/job-auth.ts` — constant-time internal-job bearer authentication.
- `lib/chat/preview-web.tsx` — accessible web renderer for the shared fixtures.
- `lib/commands/today.ts` — registered `get_today` query over one typed Postgres RPC.
- `lib/commands/chat.ts` — RLS-bound integration queries/commands.
- `app/api/webhooks/slack/route.ts` — Chat SDK Slack webhook route.
- `app/api/chat/slack/install/route.ts` — authenticated admin OAuth start.
- `app/api/chat/slack/oauth/route.ts` — OAuth callback and partial-failure reconciliation.
- `app/api/chat/jobs/scan/route.ts` — authenticated scheduler wake.
- `app/api/chat/jobs/deliver/route.ts` — authenticated bounded delivery worker.
- `app/api/chat/jobs/cleanup/route.ts` — authenticated adapter-state expiry cleanup.
- `app/(app)/settings/chat/page.tsx` — server-owned health/settings page.
- `app/(app)/settings/chat/chat-settings-client.tsx` — settings and preview interaction.
- `app/(app)/settings/chat/link/page.tsx` — authenticated link-proof completion.
- `slack-app-manifest.template.yml` — reviewed Slack scopes/events with `${APP_URL}` substitution.
- `scripts/render-slack-manifest.ts` — validates `APP_URL` and writes an importable ignored manifest.

### New tests

- `tests/chat-state-adapter.test.ts`
- `tests/chat-schema.test.ts`
- `tests/chat-contracts.test.ts`
- `tests/chat-preview.test.ts`
- `tests/chat-adapter-conformance.test.ts`
- `tests/commands-chat.test.ts`
- `tests/commands-today.test.ts`
- `tests/chat-oauth.test.ts`
- `tests/chat-linking.test.ts`
- `tests/chat-occurrences.test.ts`
- `tests/chat-delivery-policy.test.ts`
- `tests/chat-slack-renderer.test.ts`
- `tests/chat-webhook.test.ts`
- `tests/chat-jobs.test.ts`
- `tests-e2e/chat-previews.ts`

## Dependency graph and parallelism

```text
Task 1 compatibility gate
  -> Task 2 schema/RLS
      -> Task 3 contracts/fixtures
          -> Task 4 production previews
          -> Task 9 Slack renderer + webhook
      -> Task 5 installation lifecycle
          -> Task 6 staff linking
      -> Task 7 Today reason contract
          -> Task 8 occurrences/delivery policy
              -> Task 10 worker + digests
      Task 5 + 6 + 8 + 9 -> Task 11 integration-owned actions
      Task 4 + 5 + 6 + 10 + 11 -> Task 12 settings/health
      Task 9 + 10 + 12 -> Task 13 Slack sandbox/browser proof
      all -> Task 14 documentation/final gate
```

After Task 3, Tasks 4 and 7 can run in parallel. Task 5 can run in parallel with Task 4 because it does not touch preview files. Tasks 6, 8, and 10 serialize because they modify the baseline migration. Task 9 waits for the contracts and installation lookup interface. Task 12 is the single integration owner for the shared settings page.

---

### Task 1: Prove restricted Postgres Chat SDK state

**Files:**
- Test: `tests/chat-state-adapter.test.ts`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `supabase/migrations/00001_baseline.sql` under a new private Chat SDK state section

**Interfaces:**
- Consumes: Chat SDK 4.39.0 `StateAdapter` and Postgres 15.
- Produces: `chat_sdk` schema, exact five adapter tables/indexes, and a verified connection contract for `createPostgresState({ client, keyPrefix })`.

- [x] **Step 1: Add the approved dependencies**

Run:

```bash
bun add chat@^4.39.0 @chat-adapter/slack@^4.39.0 @chat-adapter/state-pg@^4.39.0 pg@^8.20.0 && bun add -d @types/pg@^8.18.0
```

Expected: `package.json` records the four runtime packages and one type-only dev package; no other package changes.

- [x] **Step 2: Write the failing restricted-role test**

Create `tests/chat-state-adapter.test.ts` with a module comment and this contract:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createPostgresState } from "@chat-adapter/state-pg";

const adminUrl = process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@127.0.0.1:54342/postgres";
const admin = new pg.Pool({ connectionString: adminUrl });
const role = `mgr_chat_test_${process.pid}`;
const password = crypto.randomUUID();
let restricted: pg.Pool;

beforeAll(async () => {
  await admin.query(`create role ${role} login password '${password}'`);
  await admin.query(`grant mgr_chat_sdk to ${role}`);
  const restrictedUrl = new URL(adminUrl);
  restrictedUrl.username = role;
  restrictedUrl.password = password;
  restricted = new pg.Pool({
    connectionString: restrictedUrl.toString(),
    options: "-c search_path=chat_sdk",
  });
});

afterAll(async () => {
  await restricted?.end();
  await admin.query(`revoke mgr_chat_sdk from ${role}`);
  await admin.query(`drop role if exists ${role}`);
  await admin.end();
});

describe("Chat SDK Postgres state isolation", () => {
  it("confines adapter CREATE to chat_sdk and denies public data access", async () => {
    const privilege = await admin.query(
      `select
         has_schema_privilege($1, 'chat_sdk', 'CREATE') as can_create_chat,
         has_schema_privilege($1, 'public', 'CREATE') as can_create_public`,
      [role],
    );
    expect(privilege.rows[0]).toEqual({
      can_create_chat: true,
      can_create_public: false,
    });

    const groupRole = await admin.query(`
      select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_roles
      where rolname = 'mgr_chat_sdk'
    `);
    expect(groupRole.rows).toEqual([{
      rolcanlogin: false,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    }]);
    const inheritedRoles = await admin.query(`
      select 1
      from pg_auth_members
      where member = (select oid from pg_roles where rolname = 'mgr_chat_sdk')
    `);
    expect(inheritedRoles.rows).toEqual([]);

    const state = createPostgresState({ client: restricted, keyPrefix: `mgr-test-${process.pid}` });
    await state.connect();
    await state.set("probe", { ok: true }, 60_000);
    await expect(state.get("probe")).resolves.toEqual({ ok: true });
    const lock = await state.acquireLock("slack:T1:C1", 5_000);
    expect(lock).not.toBeNull();
    if (lock) await state.releaseLock(lock);

    await expect(restricted.query("select count(*) from public.breweries")).rejects.toThrow(/permission denied/i);
    await state.disconnect();
  });
});
```

- [x] **Step 3: Run the test red**

Run: `npx vitest run tests/chat-state-adapter.test.ts`

Expected: FAIL because `chat_sdk` and its exact adapter tables/grants do not exist.

- [x] **Step 4: Pre-create and isolate the exact adapter schema**

Add the exact five table definitions and four expiry indexes from `@chat-adapter/state-pg@4.39.0` to the baseline migration, schema-qualified under `chat_sdk`. Drop and recreate the cluster-scoped group role so a reset cannot inherit stale LOGIN/elevated attributes, memberships, or grants; `DROP ROLE` must fail closed if outside dependencies exist. The recreated no-login role receives `USAGE`, `CREATE`, required runtime DML, and sequence privileges only in `chat_sdk`; the provisioned login receives membership. Grant it nothing on MGR application schemas.

```sql
drop role if exists mgr_chat_sdk;
create role mgr_chat_sdk
  nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

create schema chat_sdk;
revoke all on schema chat_sdk from public;
grant create on schema chat_sdk to mgr_chat_sdk;
grant usage on schema chat_sdk to mgr_chat_sdk;

create table chat_sdk.chat_state_subscriptions (
  key_prefix text not null,
  thread_id text not null,
  created_at timestamptz not null default now(),
  primary key (key_prefix, thread_id)
);

create table chat_sdk.chat_state_locks (
  key_prefix text not null,
  thread_id text not null,
  token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (key_prefix, thread_id)
);
create index chat_state_locks_expires_idx on chat_sdk.chat_state_locks (expires_at);

create table chat_sdk.chat_state_cache (
  key_prefix text not null,
  cache_key text not null,
  value text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (key_prefix, cache_key)
);
create index chat_state_cache_expires_idx on chat_sdk.chat_state_cache (expires_at);

create table chat_sdk.chat_state_lists (
  key_prefix text not null,
  list_key text not null,
  seq bigserial not null,
  value text not null,
  expires_at timestamptz,
  primary key (key_prefix, list_key, seq)
);
create index chat_state_lists_expires_idx on chat_sdk.chat_state_lists (expires_at);

create table chat_sdk.chat_state_queues (
  key_prefix text not null,
  thread_id text not null,
  seq bigserial not null,
  value text not null,
  expires_at timestamptz not null,
  primary key (key_prefix, thread_id, seq)
);
create index chat_state_queues_expires_idx on chat_sdk.chat_state_queues (expires_at);

grant select, insert, update, delete on all tables in schema chat_sdk to mgr_chat_sdk;
grant usage, select on all sequences in schema chat_sdk to mgr_chat_sdk;
alter default privileges in schema chat_sdk
  grant select, insert, update, delete on tables to mgr_chat_sdk;
alter default privileges in schema chat_sdk
  grant usage, select on sequences to mgr_chat_sdk;
```

- [x] **Step 5: Reset and run the compatibility gate**

Run:

```bash
npx supabase db reset
npx vitest run tests/chat-state-adapter.test.ts
npx tsc --noEmit
```

Expected: PASS. If the adapter reads or creates outside `chat_sdk`, can access `public.breweries`, or needs broader database privileges, stop and return to architecture review. Do not grant any application-schema access or use owner/service-role database credentials.

- [x] **Step 6: Commit the passed compatibility spike**

```bash
git add package.json bun.lock supabase/migrations/00001_baseline.sql tests/chat-state-adapter.test.ts
git commit -m "test: prove isolated Chat SDK Postgres state"
```

---

### Task 2: Add provider-neutral schema and RLS

**Files:**
- Test: `tests/chat-schema.test.ts`
- Modify: `supabase/migrations/00001_baseline.sql`
- Modify: `tests/schema-conventions.test.ts`
- Modify: `tests/schema-rules.test.ts`

**Interfaces:**
- Consumes: Task 1 private state schema.
- Produces: typed rows for installations, links, destinations, preferences, occurrences, deliveries, callback receipts, action intents, and the brewery reading cadence.

- [x] **Step 1: Write failing schema and tenant-isolation tests**

Cover these exact invariants in `tests/chat-schema.test.ts`:

```ts
it("defaults reading cadence to 24 hours and rejects 0 or 169", async () => {});
it("allows one active installation per brewery/provider", async () => {});
it("prevents one Slack workspace from mapping to two breweries", async () => {});
it("blocks cross-brewery reads for installations, links, destinations and preferences", async () => {});
it("exposes no occurrence, delivery, callback receipt or action intent rows to authenticated users", async () => {});
it("enforces installation-scoped external user and destination uniqueness", async () => {});
```

Use `makeBrewery`, `makeStaffCtx`, `asUser`, and `admin` from `tests/helpers.ts`; do not mock Supabase.

- [x] **Step 2: Run the schema tests red**

Run: `npx vitest run tests/chat-schema.test.ts tests/schema-conventions.test.ts tests/schema-rules.test.ts`

Expected: FAIL on missing cadence column and chat tables.

- [x] **Step 3: Add exact provider-neutral tables**

Add `fermentation_reading_due_hours int not null default 24 check (fermentation_reading_due_hours between 1 and 168)` to `breweries`.

Create the eight tables from spec §7. Use `text` provider identifiers constrained by `^[a-z][a-z0-9_-]{1,31}$`, partial unique indexes for active installations, composite tenant foreign keys, `jsonb` only for capability/metadata snapshots, and explicit timestamp columns. The central occurrence/delivery keys are:

```sql
create table notification_occurrences (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  reason text not null check (reason in ('submitted_order','pick_due','delivery_next','fermentation_reading_overdue','operations_digest')),
  subject_type text not null,
  subject_id text not null,
  source_version text not null,
  occurred_at timestamptz not null,
  owner_query text not null check (owner_query in ('orders','picks','deliveries','fermentation','digest')),
  due_at timestamptz,
  urgency text not null check (urgency in ('normal','attention')),
  payload jsonb not null,
  semantic_key text not null,
  state text not null default 'active' check (state in ('active','resolved','suppressed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, semantic_key)
);

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  brewery_id uuid not null references breweries(id),
  occurrence_id uuid not null,
  destination_id uuid not null,
  installation_id uuid not null,
  provider text not null,
  semantic_key text not null,
  state text not null default 'queued' check (state in ('queued','leased','retrying','sent','updated','suppressed','terminal')),
  attempt_count int not null default 0,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_conversation_id text,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brewery_id),
  unique (brewery_id, semantic_key),
  foreign key (occurrence_id, brewery_id) references notification_occurrences(id, brewery_id),
  foreign key (destination_id, brewery_id) references notification_destinations(id, brewery_id),
  foreign key (installation_id, brewery_id) references chat_installations(id, brewery_id)
);
```


| Table | Required columns and constraints |
|---|---|
| `chat_installations` | `id`, `brewery_id`, `provider`, `external_installation_id`, nullable `external_enterprise_id`, `display_label`, `state` (`pending`, `active`, `disabled`, `needs_reauthorization`, `disconnected`), nullable OAuth intent hash/redirect URI/expiry/consumed/reconciled timestamps, `granted_capabilities jsonb`, nullable brewery quiet-hour start/end/timezone, `installer_user_id`, `token_store_key`, installed/disabled/disconnected/health timestamps, redacted `last_failure_code`, created/updated timestamps. Partial unique indexes enforce one non-disconnected brewery/provider installation and one active provider/external installation globally. |
| `chat_user_links` | `id`, `brewery_id`, `installation_id`, `provider`, `external_user_id`, `user_id`, `state` (`pending`, `active`, `disabled`, `unlinked`), nullable proof hash/issued/expires/consumed timestamps, linked/disabled/unlinked timestamps, created/updated timestamps. Unique `(installation_id, external_user_id)` and one active `(installation_id, user_id)`. |
| `notification_destinations` | `id`, `brewery_id`, `installation_id`, `kind` (`personal`, `private_channel`), `external_destination_id`, nullable `user_id`, `privacy_class` (`direct`, `private_internal`), `capabilities jsonb`, `state` (`active`, `blocked`), nullable `blocked_reason`, validation/created/updated timestamps. Unique `(installation_id, external_destination_id)` and partial uniqueness for one active shared channel per installation. |
| `notification_preferences` | `id`, `brewery_id`, `user_id`, `reason`, `enabled`, nullable `personal_destination_id`, nullable personal quiet-hour start/end/timezone, `use_brewery_timezone`, created/updated timestamps. Unique `(brewery_id, user_id, reason)`. |
| `chat_callback_receipts` | `id`, `brewery_id`, `installation_id`, `provider`, `callback_id`, `callback_kind`, `disposition` (`pending`, `processing`, `processed`, `ignored`, `failed`), `payload_hash`, nullable redacted `error_code`, received/processing/completed timestamps. Unique `(installation_id, callback_id)`; no raw callback body. |
| `chat_action_intents` | `id`, `brewery_id`, `installation_id`, `user_id`, `provider`, `action_origin_hash`, `command_name`, `input_hash`, `subject_type`, `subject_id`, `subject_version`, `request_id`, `preview_token_hash`, `allowed_action`, expiry/consumed timestamps, nullable `first_result_reference`, created timestamp. Unique `request_id`; no canonical input, provider payload, or token material. |

All tenant references use `(id, brewery_id)` composite foreign keys. `token_store_key` is globally unique, identifies an encrypted Chat SDK state entry, and is never a credential.

- [x] **Step 4: Add least-privilege RLS**

Enable RLS everywhere. Ordinary authenticated clients receive bounded `SELECT` only: admins receive installation-health columns only; linked users receive their own link, personal destination, and preferences only while current brewery membership and an active same-brewery link remain valid. All writes are reserved for later named registered RPCs/commands, including shared-destination administration. `notification_occurrences`, `notification_deliveries`, `chat_callback_receipts`, and `chat_action_intents` have no authenticated access; named internal functions expose only bounded results.

- [x] **Step 5: Reset and prove tenancy**

Run:

```bash
npx supabase db reset
npx vitest run tests/chat-schema.test.ts tests/schema-conventions.test.ts tests/schema-rules.test.ts
npx tsc --noEmit
```

Expected: PASS with no cross-tenant rows and no new schema-rule exclusions.

- [x] **Step 6: Commit schema foundation**

```bash
git add supabase/migrations/00001_baseline.sql tests/chat-schema.test.ts tests/schema-conventions.test.ts tests/schema-rules.test.ts
git commit -m "feat: add provider-neutral chat schema"
```

---

### Task 3: Define portable contracts and fixtures

**Files:**
- Test: `tests/chat-contracts.test.ts`
- Test: `tests/chat-preview.test.ts`
- Create: `lib/chat/contracts.ts`
- Create: `lib/chat/preview-fixtures.ts`

**Interfaces:**
- Consumes: spec §§5, 7, and 17.
- Produces: `NotificationReason`, `PortableNotification`, `ChatCapabilitySet`, `ChatPreviewId`, `CHAT_PREVIEW_FIXTURES`, and `assertPortableNotification`.

- [x] **Step 1: Write failing contract tests**

Assert every portable item parses, every preview ID is unique, team fixtures contain only aggregate data, gated forms have `enabled: false`, and forbidden data keys/secret-like values are absent.

```ts
const forbiddenKeys = new Set([
  "email", "phone", "price", "balance", "licenseNumber", "signature",
  "freeTextNote", "token", "secret", "address",
]);
const keys = (value: unknown): string[] =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)])
    : [];

for (const fixture of CHAT_PREVIEW_FIXTURES) {
  for (const item of fixture.items) {
    expect(() => assertPortableNotification(item)).not.toThrow();
  }
  expect(keys(fixture).filter((key) => forbiddenKeys.has(key))).toEqual([]);
  expect(JSON.stringify(fixture)).not.toMatch(/xox[baprs]-|-----BEGIN|\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i);
}
```

- [x] **Step 2: Run red**

Run: `npx vitest run tests/chat-contracts.test.ts tests/chat-preview.test.ts`

Expected: FAIL because the contracts and fixtures do not exist.

- [x] **Step 3: Add exact portable types**

```ts
export type NotificationReason =
  | "submitted_order"
  | "pick_due"
  | "delivery_next"
  | "fermentation_reading_overdue"
  | "operations_digest";

export type PortableAction = {
  id: "open_mgr" | "snooze" | "mute_reason" | "edit_preferences" | "refresh";
  label: string;
  intentId?: string;
  url?: string;
  enabled: boolean;
  disabledReason?: string;
};

export type PortableNotification = {
  reason: NotificationReason;
  urgency: "normal" | "attention";
  subject: { type: "order" | "delivery" | "occupancy" | "digest"; id: string; safeLabel: string };
  title: string;
  detail: string;
  dueAt: string | null;
  ownerClass: "sales" | "warehouse" | "driver" | "brewer" | "team";
  resolutionKey: string;
  actions: readonly PortableAction[];
};

export type ChatCapabilitySet = {
  personalDelivery: boolean;
  persistentHome: boolean;
  privateSharedSummary: boolean;
  messageUpdate: boolean;
  modal: boolean;
};

export type ChatPreviewId =
  | "settings-disconnected" | "settings-active" | "link"
  | "app-home" | "personal-dm" | "team-digest" | "preferences"
  | "fermentation-gated" | "order-confirm-gated" | "reauthorization";

export type ChatPreviewFixture = {
  id: ChatPreviewId;
  surface: "settings" | "app_home" | "direct_message" | "private_channel" | "modal";
  title: string;
  eyebrow: string;
  status?: { label: string; tone: "neutral" | "healthy" | "attention" };
  fields: readonly { label: string; value: string }[];
  items: readonly PortableNotification[];
  actions: readonly PortableAction[];
};
```

Validate each `PortableNotification` with a Zod schema and export `assertPortableNotification(value: unknown): asserts value is PortableNotification`. Keep provider IDs and Block Kit types out of this file.

- [x] **Step 4: Add the ten committed fixtures**

Use the exact scenarios and safe labels shown in wireframe build step 8. The fermentation and order-confirm fixtures expose only `open_mgr`; their provider actions remain disabled with human correction copy.

- [x] **Step 5: Run green and type-check**

Run:

```bash
npx vitest run tests/chat-contracts.test.ts tests/chat-preview.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [x] **Step 6: Commit contracts**

```bash
git add lib/chat/contracts.ts lib/chat/preview-fixtures.ts tests/chat-contracts.test.ts tests/chat-preview.test.ts
git commit -m "feat: define portable chat presentation contracts"
```

---

### Task 4: Build production preview gallery

**Files:**
- Test: `tests/chat-preview.test.ts`
- Create: `lib/chat/preview-web.tsx`
- Create: `app/(app)/settings/chat/chat-settings-client.tsx`
- Reference: `components/mgr/screens.tsx`

**Interfaces:**
- Consumes: `CHAT_PREVIEW_FIXTURES`, `ChatPreviewId`, `PortableNotification`.
- Produces: `ChatPreview`, `ChatPreviewPicker`, and an accessible fixture-only preview panel reusable by the settings page.

- [x] **Step 1: Extend the renderer test red**

Use `renderToStaticMarkup` from `react-dom/server` to assert every fixture renders a named surface, disabled actions carry visible reasons, and the output contains no provider request code or live IDs.

```ts
const html = renderToStaticMarkup(<ChatPreview fixture={fixture} />);
expect(html).toContain(fixture.title);
expect(html).toContain("Preview data");
```

- [x] **Step 2: Implement the minimal web renderer**

Use native `<button>`, `<fieldset>`, `<legend>`, and `<section aria-labelledby>`. The picker is keyboard-operable, uses a visible selected state plus text, and does not use color alone. Every target is at least 24×24 CSS pixels. Gated previews render `aria-disabled="true"` plus the same visible reason.

- [x] **Step 3: Verify the committed HTML artifact stays synchronized**

Assert the existing rev-4 artifact still has exactly 73 frames and 10 `group:'Chat'` entries with the Chat filter, build step 8, phone/desk rendering, 24-hour cadence field, and gated-form copy. Change it only when the production fixture contract changes.

- [x] **Step 4: Verify renderer and artifact**

Run:

```bash
npx vitest run tests/chat-preview.test.ts
npx tsc --noEmit
```

Open the HTML artifact in a browser, select **Chat**, select phone and desk, and verify: total `73`, Chat frames `10`, no console exception, no horizontal overflow, and readable focus indicators.

- [x] **Step 5: Commit previews**

```bash
git add lib/chat/preview-web.tsx app/'(app)'/settings/chat/chat-settings-client.tsx tests/chat-preview.test.ts
git commit -m "feat: add production chat surface previews"
```

---

### Task 5: Implement installation lifecycle and OAuth

**Files:**
- Test: `tests/chat-oauth.test.ts`
- Create: `lib/chat/state.ts`
- Create: `lib/chat/slack-adapter.ts`
- Create: `lib/chat/oauth.ts`
- Create: `app/api/chat/slack/install/route.ts`
- Create: `app/api/chat/slack/oauth/route.ts`
- Modify: `supabase/migrations/00001_baseline.sql`

**Interfaces:**
- Consumes: `chat_installations`, restricted Postgres state, Chat SDK `handleOAuthCallback`.
- Produces: `beginSlackInstall(ctx, redirectUri)`, `beginSlackReauthorization(ctx, installationId, redirectUri)`, `completeSlackInstall(request)`, `reconcileSlackInstall(intentId)`, and `disconnectSlackInstallation(ctx, installationId)`.

```ts
export type SlackOAuthPort = {
  handleOAuthCallback(request: Request, options: { redirectUri: string }): Promise<{
    teamId: string;
    enterpriseId?: string;
    isEnterpriseInstall: boolean;
  }>;
  getInstallation(id: string): Promise<{ botToken: string; scope?: string } | null>;
  deleteInstallation(id: string): Promise<void>;
};
```

- [x] **Step 1: Write failing lifecycle tests**

Cover admin-only install/reauthorization start, ten-minute hashed state, exact redirect binding, reauthorization bound to the existing installation, state replay, forged state, removed installer, workspace already mapped elsewhere, partial token-store success, idempotent callback replay, scope mismatch, reconciliation, disable-first disconnect, and credential deletion failure.

- [x] **Step 2: Run red**

Run: `npx vitest run tests/chat-oauth.test.ts`

Expected: FAIL on missing lifecycle services/RPCs.
- [x] **Step 3: Add atomic lifecycle RPCs**

Add `begin_chat_installation`, `begin_chat_reauthorization`, `activate_chat_installation`, `mark_chat_installation_reauthorization`, `disable_chat_installation`, and `disconnect_chat_installation`. Each function pins `brewery_id`, enforces admin where user-facing, locks the row, and returns a bounded JSON result. Reauthorization binds the intent to the existing installation and preserves disabled delivery until activation succeeds. Disconnect marks disabled and invalidates active destinations/links/intents in one RPC before external credential deletion.

- [x] **Step 4: Build Slack authorize and callback routes**

The install route reads `breweryId` plus optional `installationId`, builds normal cookie-auth `Ctx`, requires admin, records `sha256(state)` with intent kind (`install` or `reauthorize`), and returns a 303 redirect to `https://slack.com/oauth/v2/authorize` with exact scopes and redirect URI. The callback validates state before token exchange, calls `handleOAuthCallback`, verifies the returned installation/workspace and exact scopes, activates the new or bound installation, and redirects to `/settings/chat?installed=1`.

- [x] **Step 5: Run green**

Run:

```bash
npx supabase db reset
npx vitest run tests/chat-oauth.test.ts
npx tsc --noEmit
```

Expected: PASS; raw state and tokens never appear in logs or database snapshots outside encrypted Chat SDK state.

- [x] **Step 6: Commit lifecycle**

```bash
git add lib/chat/state.ts lib/chat/slack-adapter.ts lib/chat/oauth.ts app/api/chat/slack/install/route.ts app/api/chat/slack/oauth/route.ts supabase/migrations/00001_baseline.sql tests/chat-oauth.test.ts
git commit -m "feat: add Slack installation lifecycle"
```

---

### Task 6: Implement explicit staff linking

**Files:**
- Test: `tests/chat-linking.test.ts`
- Create: `lib/chat/linking.ts`
- Create: `app/(app)/settings/chat/link/page.tsx`
- Modify: `lib/commands/chat.ts`
- Modify: `lib/commands/all.ts`
- Modify: `supabase/migrations/00001_baseline.sql`

**Interfaces:**
- Consumes: active installation, external Slack user ID, authenticated MGR `Ctx`.
- Produces: `issueChatLinkProof(installationId, externalUserId)`, `consume_chat_link_proof`, `unlink_chat_user`, and `get_chat_link_status`.

- [x] **Step 1: Write failing link tests**

Cover single use, ten-minute expiry, installation binding, external-user binding, brewery membership, customer rejection, email mismatch irrelevance, replay, role removal, unlink, and installation disable.

- [x] **Step 2: Run red**

Run: `npx vitest run tests/chat-linking.test.ts`

- [x] **Step 3: Add proof and consume flow**

Store only SHA-256 proof hashes. The App Home handler issues the raw proof once and builds `/settings/chat/link?proof=...`. The protected page uses the current MGR session and `runCommand("consume_chat_link_proof", { proof }, ctx)`. The RPC locks the pending link, checks expiry/consumption/installation/brewery membership, records `user_id`, and consumes the hash atomically.

- [x] **Step 4: Revalidate every callback**

Add:

```ts
export type ResolvedChatActor = {
  installationId: string;
  breweryId: string;
  externalUserId: string;
  userId: string;
  role: "admin" | "sales" | "warehouse" | "brewer";
};

export async function resolveChatActor(
  provider: "slack",
  installationExternalId: string,
  externalUserId: string,
): Promise<ResolvedChatActor | null>;
```

It reads active installation, active link, and current `brewery_users` membership each time. It does not return a Supabase user token.

- [x] **Step 5: Run green and commit**

Run:

```bash
npx supabase db reset
npx vitest run tests/chat-linking.test.ts tests/commands-chat.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add lib/chat/linking.ts lib/commands/chat.ts lib/commands/all.ts app/'(app)'/settings/chat/link/page.tsx supabase/migrations/00001_baseline.sql tests/chat-linking.test.ts tests/commands-chat.test.ts
git commit -m "feat: link Slack users to current staff memberships"
```

---

### Task 7: Implement the four MGR Today reasons

**Files:**
- Test: `tests/commands-today.test.ts`
- Create: `lib/commands/today.ts`
- Modify: `lib/commands/all.ts`
- Modify: `supabase/migrations/00001_baseline.sql`

**Interfaces:**
- Consumes: orders, routes/deliveries, occupancies/readings, brewery timezone/cadence.
- Produces: registered `get_today`, SQL `get_today_items(p_now timestamptz)`, shared `private.today_candidates`, and internal-only `scan_chat_today_candidates(p_brewery_id uuid, p_now timestamptz)`.

```ts
export type TodayItem = {
  reason: "submitted_order" | "pick_due" | "delivery_next" | "fermentation_reading_overdue";
  subjectType: "order" | "delivery" | "occupancy";
  subjectId: string;
  sourceVersion: string;
  safeLabel: string;
  detail: string;
  dueAt: string | null;
  href: string;
  recipientRoles: readonly ("admin" | "sales" | "warehouse" | "brewer")[];
  assignedUserId: string | null;
};
```

- [x] **Step 1: Write failing role/due tests**

Cover:

- submitted orders visible to sales/admin;
- confirmed orders with `requested_ship_date <= brewery-local date` visible to warehouse/admin;
- only the lowest incomplete stop on a due route visible to assigned warehouse driver/admin;
- open occupancy overdue when latest reading or occupancy start plus cadence is `<= p_now`;
- default 24 and updated 1–168 cadence;
- source-version change on relevant state changes;
- no customer role visibility;
- safe labels and hrefs.

- [x] **Step 2: Run red**

Run: `npx vitest run tests/commands-today.test.ts`

- [x] **Step 3: Add one shared candidate projection and two bounded readers**

Define the four due rules once in a `security_invoker` `private.today_candidates` view. `get_today_items(p_now)` derives the caller's brewery/membership and filters by role; the internal scan function accepts one brewery and returns the same fixed safe columns for occurrence generation. Revoke the scan function from `PUBLIC`, `anon`, and `authenticated`; grant it only to `service_role`. Set an explicit safe `search_path`.

Use brewery timezone for date comparisons. Use `md5(concat_ws('|', ...relevant columns...))` as a non-secret stale token. For no-reading occupancies, use `vessel_occupancies.started_at`; do not synthesize a reading. Driver rows require `routes.driver_user_id = auth.uid()` in the registered-reader path unless the current role is admin.

- [x] **Step 4: Register `get_today`**

`lib/commands/today.ts` calls only `get_today_items`, maps snake_case to `TodayItem`, and rechecks role visibility in the registry. No Slack import enters the command layer.

- [x] **Step 5: Run green and commit**

Run:

```bash
npx supabase db reset
npx vitest run tests/commands-today.test.ts tests/registry.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add lib/commands/today.ts lib/commands/all.ts supabase/migrations/00001_baseline.sql tests/commands-today.test.ts
git commit -m "feat: define Today notification reasons"
```

---

### Task 8: Create occurrences, destinations, preferences, and leases

**Files:**
- Test: `tests/chat-occurrences.test.ts`
- Test: `tests/chat-delivery-policy.test.ts`
- Modify: `supabase/migrations/00001_baseline.sql`
- Modify: `lib/commands/chat.ts`

**Interfaces:**
- Consumes: `get_today_items`, active links/installations/destinations, quiet hours.
- Produces: `scan_chat_notification_occurrences`, `lease_chat_deliveries`, `complete_chat_delivery`, `retry_chat_delivery`, `suppress_chat_delivery`, preference/destination commands.

- [x] **Step 1: Write failing occurrence tests**

Cover transition atomicity, catch-up scan, semantic keys, recipient-role fan-out, assigned driver, admin fan-out, user mute, quiet-hour `next_attempt_at`, timezone/DST, resolved suppression, cadence change, morning 08:00 digest, midday 12:00 digest, missed-window recovery, and concurrent lease exclusion.

- [x] **Step 2: Prove the transition is not yet atomic**

Run: `npx vitest run tests/chat-occurrences.test.ts tests/chat-delivery-policy.test.ts`

Expected: FAIL because `submit_order` does not insert an occurrence and scan/lease functions do not exist.

- [x] **Step 3: Add semantic occurrence upsert**

Use these key shapes:

```text
submitted_order:{order_id}:{source_version}
pick_due:{order_id}:{source_version}
delivery_next:{delivery_id}:{source_version}
fermentation_reading_overdue:{occupancy_id}:{latest_reading_or_started_at}
operations_digest:{destination_id}:{brewery_local_date}:{morning|midday}
```

The scan upserts active occurrences, resolves stale ones, creates personal deliveries for active linked recipients, and creates one synthetic digest occurrence per due window. It never posts messages.

- [x] **Step 4: Make submitted-order occurrence atomic**

Extend `submit_order(p_order uuid)` so the order state, order event, and `submitted_order` occurrence commit in the existing transaction. The scheduled scan uses the same semantic key for catch-up and cannot duplicate it.

- [x] **Step 5: Add bounded lease/outcome functions**

`lease_chat_deliveries(p_limit int, p_lease_seconds int, p_now timestamptz)` uses `for update skip locked`, caps `p_limit` at 100, increments attempts, and returns only provider routing IDs plus the occurrence ID. Outcome functions require the current lease and clear it atomically.

- [x] **Step 6: Run green and commit**

Run:

```bash
npx supabase db reset
npx vitest run tests/chat-occurrences.test.ts tests/chat-delivery-policy.test.ts tests/commands-orders.test.ts tests/commands-portal.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add supabase/migrations/00001_baseline.sql lib/commands/chat.ts tests/chat-occurrences.test.ts tests/chat-delivery-policy.test.ts
git commit -m "feat: create durable chat notification occurrences"
```

---

### Task 9: Render Slack surfaces and accept callbacks

**Files:**
- Test: `tests/chat-adapter-conformance.test.ts`
- Test: `tests/chat-slack-renderer.test.ts`
- Test: `tests/chat-webhook.test.ts`
- Create: `lib/chat/provider.ts`
- Create: `lib/chat/slack-renderer.ts`
- Create: `lib/chat/slack-transport.ts`
- Modify: `lib/chat/slack-adapter.ts`
- Create: `app/api/webhooks/slack/route.ts`

**Interfaces:**
- Consumes: portable contracts, installation lookup, Chat SDK webhook and `publishHomeView`.
- Produces: `ChatProviderTransport`, `renderSlackMessage`, `renderSlackHome`, `validateSlackDestination`, and `POST = bot.webhooks.slack`.

```ts
export type ProviderMessageRef = {
  conversationId: string;
  messageId: string;
};

export interface ChatProviderTransport {
  readonly provider: "slack";
  readonly capabilities: ChatCapabilitySet;
  validateDestination(input: { installationId: string; destinationId: string }): Promise<{ ok: true } | { ok: false; reason: string }>;
  send(input: { installationId: string; destinationId: string; notification: PortableNotification }): Promise<ProviderMessageRef>;
  update(input: { installationId: string; ref: ProviderMessageRef; notification: PortableNotification }): Promise<void>;
  publishHome(input: { installationId: string; externalUserId: string; items: readonly PortableNotification[] }): Promise<void>;
}
```

- [x] **Step 1: Write adapter conformance and fixture-driven Slack renderer tests**

Define a reusable conformance suite that accepts a provider transport factory plus a fake provider client. Assert declared capabilities, private-destination validation, stable message references, idempotent update semantics, and retriable-versus-permanent error classification. Run it against `SlackTransport`; future adapters must pass the same suite. Separately assert every provider-surface fixture item renders a valid Block Kit structure, text blocks stay within Slack limits, shared digest omits item detail, gated forms expose only an MGR URL, action metadata contains an opaque intent ID only, and resolved messages remove actions.
- [x] **Step 2: Write webhook contract tests**

Use signed fixture requests for valid, old timestamp, invalid signature, URL verification, duplicate `event_id`, App Home open, action replay, and disabled installation. Assert the route returns within three seconds while slow work is persisted for asynchronous handling.

- [x] **Step 3: Implement the Chat singleton and handlers**

```ts
export const slackAdapter = createSlackAdapter({
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  encryptionKey: process.env.SLACK_ENCRYPTION_KEY!,
  installationKeyPrefix: `mgr:${process.env.APP_ENV ?? "local"}:slack:installation`,
  webClientOptions: { rejectRateLimitedCalls: true },
});

export const bot = new Chat({
  userName: "MGR",
  adapters: { slack: slackAdapter },
  state: chatState,
  logger: process.env.NODE_ENV === "test" ? "silent" : "info",
}).registerSingleton();
```

Register `onAppHomeOpened` as a durable callback: verify and dedupe the event, insert a `chat_callback_receipts` row with `disposition = 'pending'`, and return the Slack acknowledgement without scanning or publishing inline. Task 10's worker claims the receipt, scans the linked brewery when applicable, then publishes either the link fixture or the linked user's current active occurrences. It never creates an RLS user token.

- [x] **Step 4: Implement destination validation**

Use Slack conversation metadata to require `is_private`, `!is_archived`, bot membership, and no external/shared flags. A failed validation blocks the team destination and never falls back to another channel.

- [x] **Step 5: Run green and commit**

Run:

```bash
npx vitest run tests/chat-adapter-conformance.test.ts tests/chat-slack-renderer.test.ts tests/chat-webhook.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add lib/chat/provider.ts lib/chat/slack-renderer.ts lib/chat/slack-transport.ts lib/chat/slack-adapter.ts app/api/webhooks/slack/route.ts tests/chat-adapter-conformance.test.ts tests/chat-slack-renderer.test.ts tests/chat-webhook.test.ts
git commit -m "feat: render Slack notification surfaces"
```

---

### Task 10: Deliver, update, retry, digest, and clean up

**Files:**
- Test: `tests/chat-jobs.test.ts`
- Create: `lib/chat/job-auth.ts`
- Create: `lib/chat/jobs.ts`
- Create: `app/api/chat/jobs/scan/route.ts`
- Create: `app/api/chat/jobs/deliver/route.ts`
- Create: `app/api/chat/jobs/cleanup/route.ts`

**Interfaces:**
- Consumes: lease RPCs, pending callback receipts, `SlackTransport`, installation-scoped `withBotToken`.
- Produces: `runChatScan(now)`, `runChatCallbackBatch(limit, now)`, `runChatDeliveryBatch(limit, now)`, `cleanupChatState(now)`, and authenticated POST routes.

- [x] **Step 1: Write failing worker tests**

Cover missing/incorrect job bearer, maximum batch 100, pending callback claim/recovery, App Home link/current-item publication, per-conversation one-second serialization, update using stored message ID, 429 `Retry-After`, transient 5xx backoff with jitter bounds, permanent 4xx terminal state, lease expiry, resolved suppression, invalid channel, revoked token, disconnect, and cleanup limited to expired private state rows.

- [x] **Step 2: Run red**

Run: `npx vitest run tests/chat-jobs.test.ts`

- [x] **Step 3: Add constant-time job authentication**

Compare `Authorization: Bearer ...` to `CHAT_JOB_SECRET` using SHA-256 digests and `timingSafeEqual`. Return generic 401; never log either value.

- [x] **Step 4: Implement bounded orchestration**

First claim `chat_callback_receipts` with `disposition = 'pending'` using `FOR UPDATE SKIP LOCKED`, transition them to `processing`, and complete them as `processed`, `ignored`, or `failed` with redacted codes. For App Home opens, scan the linked brewery if present, then publish either the link fixture or current active items.

For each delivery lease: reload occurrence state, preference, destination, installation, and provider message identity; suppress stale work; resolve installation token; enter `withBotToken(token, callback, { installationId })`; validate shared destinations; post or update; persist only provider conversation/message IDs and redacted error codes.

Backoff uses `min(3600, 2 ** min(attempt, 10))` seconds plus 0–25% jitter unless Slack supplies `Retry-After`. A conversation cannot send more than once per second.

- [x] **Step 5: Add adapter-state cleanup**

Delete only rows where `expires_at <= now()` from `chat_sdk.chat_state_locks`, `chat_state_cache`, `chat_state_lists`, and `chat_state_queues`. Keep subscriptions. Run through the restricted pool.

- [x] **Step 6: Run green and commit**

Run:

```bash
npx vitest run tests/chat-jobs.test.ts tests/chat-delivery-policy.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add lib/chat/job-auth.ts lib/chat/jobs.ts app/api/chat/jobs/scan/route.ts app/api/chat/jobs/deliver/route.ts app/api/chat/jobs/cleanup/route.ts tests/chat-jobs.test.ts
git commit -m "feat: deliver and recover chat notifications"
```

---

### Task 11: Add integration-owned Slack actions

**Files:**
- Test: `tests/commands-chat.test.ts`
- Test: `tests/chat-webhook.test.ts`
- Modify: `lib/commands/chat.ts`
- Modify: `lib/chat/slack-adapter.ts`
- Modify: `lib/chat/slack-renderer.ts`
- Modify: `supabase/migrations/00001_baseline.sql`

**Interfaces:**
- Consumes: active linked actor, opaque `chat_action_intents`, callback receipt dedupe.
- Produces: snooze, mute/unmute reason, personal quiet-hours override, preferences modal, refresh, and unlink.

- [ ] **Step 1: Write failing action tests**

Cover opaque metadata, ten-minute intent expiry, one-time consumption, callback replay, installation/user/brewery binding, removed membership, snooze not changing Today due state, mute not hiding App Home, quiet-hour validation, refresh, and unlink.

- [ ] **Step 2: Run red**

Run: `npx vitest run tests/commands-chat.test.ts tests/chat-webhook.test.ts`

- [ ] **Step 3: Add idempotent integration-state RPCs**

Add `set_notification_preference`, `snooze_notification`, `set_personal_quiet_hours`, `consume_chat_action_intent`, and `unlink_chat_user`. Replayed callback receipts return the recorded disposition. Preference upserts and snooze-extension are monotonic/idempotent.

- [ ] **Step 4: Register Slack actions and modal**

Use `bot.onAction` with action IDs `mgr_open`, `mgr_snooze`, `mgr_mute_reason`, `mgr_preferences`, `mgr_refresh`, and `mgr_unlink`. Open the preferences modal with the provider trigger ID immediately; perform writes after durable receipt. Unsupported provider/modal capability falls back to authenticated MGR.

- [ ] **Step 5: Keep domain forms disabled**

Renderer tests must prove `fermentation-gated` and `order-confirm-gated` contain no executable provider action intent and only expose `open_mgr`.

- [ ] **Step 6: Run green and commit**

Run:

```bash
npx supabase db reset
npx vitest run tests/commands-chat.test.ts tests/chat-webhook.test.ts tests/chat-slack-renderer.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add lib/commands/chat.ts lib/chat/slack-adapter.ts lib/chat/slack-renderer.ts supabase/migrations/00001_baseline.sql tests/commands-chat.test.ts tests/chat-webhook.test.ts tests/chat-slack-renderer.test.ts
git commit -m "feat: add Slack notification preferences"
```

---

### Task 12: Build Chat settings and health UI

**Files:**
- Test: `tests/commands-chat.test.ts`
- Create: `app/(app)/settings/chat/page.tsx`
- Modify: `app/(app)/settings/chat/chat-settings-client.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `lib/commands/chat.ts`

**Interfaces:**
- Consumes: `get_chat_integration_health`, preview components, admin commands.
- Produces: `/settings/chat` for disconnected, active, retrying, disabled, and reauthorization states.

- [ ] **Step 1: Extend command tests red**

Cover admin health visibility, non-admin permission denial for brewery settings, user access to personal preferences, redacted errors, reading cadence default/update, destination privacy state, queue counts, last successful callback/delivery, disable, and disconnect.

- [ ] **Step 2: Implement registered settings operations**

Register:

```text
get_chat_integration_health
get_brewery_operating_defaults
get_notification_preferences
begin_chat_reauthorization
set_brewery_operating_defaults
set_brewery_quiet_hours
set_notification_destination
disable_chat_installation
disconnect_chat_installation
```

`set_brewery_operating_defaults` updates only `fermentation_reading_due_hours` and requires admin. `set_notification_destination` accepts only the server-validated Slack conversation ID returned by the channel picker.

- [ ] **Step 3: Build the server page and client controls**

The server page loads brewery/ctx/health through the registry. The client owns only forms and fixture preview selection. Show exact scopes, workspace, private channel, brewery quiet hours, 24-hour reading cadence, linked count, queue states, redacted last error, reinstall/disable/disconnect, and all ten previews. Remove any “send test” control; production previews never call Slack.

- [ ] **Step 4: Add navigation and responsive behavior**

Add `Chat` under Settings in the current app rail. At 375px the preview appears below controls; at desktop it may sit beside controls only when both remain readable. No nested cards, horizontal scrolling, color-only status, or icon-only unlabeled control.

- [ ] **Step 5: Run green and commit**

Run:

```bash
npx vitest run tests/commands-chat.test.ts tests/chat-preview.test.ts
npx tsc --noEmit
```

Commit:

```bash
git add app/'(app)'/settings/chat/page.tsx app/'(app)'/settings/chat/chat-settings-client.tsx app/'(app)'/layout.tsx lib/commands/chat.ts tests/commands-chat.test.ts tests/chat-preview.test.ts
git commit -m "feat: add Chat integration settings"
```

---

### Task 13: Prove Slack manifest, sandbox, and browser previews

**Files:**
- Test: `tests-e2e/chat-previews.ts`
- Create: `slack-app-manifest.template.yml`
- Create: `scripts/render-slack-manifest.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: production Settings UI, `APP_URL`, Slack webhook/OAuth URLs, renderer fixtures.
- Produces: reproducible visual smoke and `.local/slack-app-manifest.yml` for Slack import.

- [ ] **Step 1: Add the reviewed Slack manifest template and renderer**

Commit `slack-app-manifest.template.yml` with only:

```yaml
display_information:
  name: MGR
  description: Staff brewery operations notifications
  background_color: "#18211c"
features:
  bot_user:
    display_name: MGR
  app_home:
    home_tab_enabled: true
    messages_tab_enabled: true
oauth_config:
  redirect_urls:
    - ${APP_URL}/api/chat/slack/oauth
  scopes:
    bot:
      - chat:write
      - im:write
      - groups:read
settings:
  event_subscriptions:
    request_url: ${APP_URL}/api/webhooks/slack
    bot_events:
      - app_home_opened
  interactivity:
    is_enabled: true
    request_url: ${APP_URL}/api/webhooks/slack
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: true
```

Do not add public-channel posting, history, email, file, user-token, admin, or slash-command scopes.

Create `scripts/render-slack-manifest.ts`:

```ts
// scripts/render-slack-manifest.ts — renders the reviewed Slack manifest for one public preview/production URL.
import { mkdir, readFile, writeFile } from "node:fs/promises";

const rawAppUrl = process.env.APP_URL;
if (!rawAppUrl) throw new Error("APP_URL is required");
const appUrl = new URL(rawAppUrl);
if (appUrl.protocol !== "https:") throw new Error("APP_URL must be a public https origin");

const template = await readFile("slack-app-manifest.template.yml", "utf8");
const rendered = template.replaceAll("${APP_URL}", appUrl.origin);
await mkdir(".local", { recursive: true });
await writeFile(".local/slack-app-manifest.yml", rendered);
console.log(".local/slack-app-manifest.yml");
```

Ignore `.local/` and add `"render:slack-manifest": "tsx scripts/render-slack-manifest.ts"`. Set `APP_URL` to the actual owned public preview or production HTTPS origin, run `npm run render:slack-manifest`, then import the generated file into Slack.

- [ ] **Step 2: Write the browser smoke**

Follow `tests-e2e/portal-smoke.ts`: seed an admin, start Next on port 3101, log in, open `/settings/chat`, select all ten preview labels by keyboard, assert the gated-form copy, verify no request targets Slack, capture phone/desktop screenshots, and assert `document.documentElement.scrollWidth === document.documentElement.clientWidth`.

Add `"test:e2e:chat": "tsx tests-e2e/chat-previews.ts"`.

- [ ] **Step 3: Run the browser smoke**

Run: `npm run test:e2e:chat`

Expected: Chrome completes disconnected preview navigation at 375px and 1440px, focus remains visible, modal close returns focus, and no Slack request occurs.

- [ ] **Step 4: Run the manual Slack sandbox matrix**

Against a non-production workspace and seeded local/preview brewery:

```text
install -> link admin/sales/warehouse/brewer -> App Home
submit order -> sales/admin DM -> resolve -> message update
confirm due order -> warehouse/admin DM
assign route -> assigned warehouse/admin DM
age reading beyond 24h -> brewer/admin DM -> record in MGR -> resolve
08:00 digest -> 12:00 digest update
quiet hours -> queued DM -> window opens -> send
archive/externalize/remove bot -> team digest disables
revoke token/uninstall -> all sends stop and actions invalidate
```

Record message timestamps and redacted delivery IDs; save no tokens or customer data.

- [ ] **Step 5: Commit manifest and browser smoke**

```bash
git add slack-app-manifest.template.yml scripts/render-slack-manifest.ts .gitignore tests-e2e/chat-previews.ts package.json bun.lock
git commit -m "test: verify Slack chat surfaces"
```

---

### Task 14: Synchronize documentation and run the merge gate

**Files:**
- Test: full repository suite and browser smoke
- Modify: `.agents/ARCHITECTURE.md`
- Modify: `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`
- Modify: `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`
- Modify: `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md`
- Modify: `.agents/superpowers/specs/2026-09-01-mgr-chat-notifications-design.md`
- Modify: `public/docs/user-guide.html`
- Modify: `README.md`
- Modify: `.agents/PROGRESS.md`

**Interfaces:**
- Consumes: completed implementation and observed sandbox behavior.
- Produces: exact operator/user/developer documentation and a green merge gate.

- [ ] **Step 1: Update architecture and schema owners**

Document provider-neutral table ownership, `chat_sdk` isolation, the narrow chat-job service exception, every RPC, semantic keys, lease states, fixed digest windows, 24-hour default cadence, and projection-only boundary.

- [ ] **Step 2: Update user-facing behavior**

In plain customer language, document install permissions, linking, App Home, DMs, digest, quiet hours, mute/snooze, reading cadence, privacy, disconnect, reauthorization, and why operational Slack forms say **Open in MGR**.

- [ ] **Step 3: Update local and sandbox setup**

Document exact environment names without values:

```text
APP_URL
APP_ENV
POSTGRES_URL
CHAT_STATE_DATABASE_URL
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
SLACK_SIGNING_SECRET
SLACK_ENCRYPTION_KEY
SLACK_REDIRECT_URI
CHAT_JOB_SECRET
```

Document manifest import, ngrok/preview callback setup, local cleanup route, and token/key rotation procedure. The database setup must use an interactive `psql` session to create `mgr_chat_runtime LOGIN`, grant only `mgr_chat_sdk`, set its default search path to `chat_sdk`, and assign its password with `\password mgr_chat_runtime`; `CHAT_STATE_DATABASE_URL` contains that dedicated login and never the database owner.

- [ ] **Step 4: Run full verification**

Run:

```bash
npx supabase db reset
npx vitest run
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e:chat
```

Expected: every command exits 0. Then inspect the rendered Settings gallery and one real Slack App Home/DM/digest flow. Tests alone do not prove provider rendering.

- [ ] **Step 5: Check the final diff and branch**

Run:

```bash
git branch --show-current
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Expected: branch `plan/chat-notifications`, no unrelated files, no whitespace errors, no binary diff, and no secret/token value.

- [ ] **Step 6: Commit documentation**

```bash
git add .agents/ARCHITECTURE.md .agents/PROGRESS.md .agents/superpowers/specs public/docs/user-guide.html README.md
git commit -m "docs: explain Slack chat notifications"
```

## Execution stop conditions

Stop immediately and return to design review if any of these occurs:

- Chat SDK Postgres state needs access or object creation outside private `chat_sdk`.
- Slack OAuth cannot isolate concurrent installation tokens or safely handle rotation.
- A callback path needs a stored Supabase refresh token or service-role user impersonation.
- A shared destination cannot be proven private and non-external.
- One Slack action can execute a domain command in this plan.
- One transition can commit domain state without its required occurrence or vice versa.
- A retry can produce a duplicate domain write.
- A preview reads live customer data or sends a provider request.
- Disconnect cannot stop queued delivery independently of Slack.
- Any test observes cross-brewery installation, link, occurrence, delivery, or token state.

## Completion report

The executor's final report must list:

- tasks and commits completed;
- compatibility-gate evidence;
- exact Slack scopes granted;
- tables, RPCs, commands, routes, and components added;
- tests and browser/sandbox journeys exercised;
- documentation updated;
- deviations from this plan;
- remaining gates for fermentation entry, order confirmation, and a second provider.
