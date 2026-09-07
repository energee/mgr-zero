# Backend database integration — unification plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement a program task-by-task after Ted confirms the direction forks in §Direction. Steps use checkbox (`- [ ]`) syntax. Do not start Programs 2–9 until Program 0 is merged and the program's own TDD plan exists.

**Goal:** Close the gap between the settled screens, the later Ted-decided specs, and the live database/command/app layers — without a v1-style 276-migration rewrite, and without pretending 108 designed operations are one PR.

**Architecture:** The command registry stays the only domain API (`POST /api/command`). Schema changes stay in-place edits to `supabase/migrations/00001_baseline.sql` until first deploy. Each program is one independently mergeable slice: failing vitest against real Postgres → one `security definer` RPC + `private.claim_command_request` → `defineCommand`/`defineQuery` → live page that matches the screen record → ungate `screens.tsx` → `bun run docs:api` + staff/portal guide. Screens remain fixture drawings; they never become data-bound.

**Tech Stack:** Next.js App Router, Bun, Supabase/Postgres, zod command registry, vitest against a throwaway local database, `agent-browser` for the eyeball check.

**Spec:** This plan sequences, it does not replace:

- Schema §1–§15 (migrated) and §16 (not migrated): `.agents/superpowers/specs/2026-08-31-mgr-schema-design.md`
- Decisions: `.agents/superpowers/specs/2026-08-31-mgr-schema-decisions.md`
- Locations/bins/transfers (Ted 2026-09-06): `.agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md` and plan `.agents/superpowers/plans/2026-09-06-locations-bins-phase1.md`
- Packaging plan-by-product (Ted 2026-09-05): `.agents/superpowers/specs/2026-09-05-mgr-packaging-source-planning.md`
- Purchasing send/lead times (Ted 2026-09-07): `.agents/superpowers/specs/2026-09-07-mgr-purchasing-send-and-lead-times.md`
- Sale channels (needs §16.3 reconcile): `docs/plans/sale-channels-customizable.md`
- UI gates: `.agents/superpowers/specs/2026-08-31-mgr-ui-layout-plan.md` §2 and §7
- Designed-operation backlog (generated, do not hand-edit): `.agents/superpowers/plans/2026-09-06-api-operations-backlog.md`
- Iron rules: `.agents/ARCHITECTURE.md`
- v1 lessons: `.agents/superpowers/specs/2026-08-31-mgr-v1-review.md`

## Global Constraints

- Worktree `.agents/worktrees/backend`, branch `backend`. Run `pwd && git branch --show-current` before the first edit of every task. Never edit `main` or a sibling worktree.
- One baseline file. Do not add a second migration without asking.
- Every mutation is one idempotent `security definer` RPC (`search_path = ''`, `private.assert_staff` or `private.assert_customer`, `claim_command_request` / `complete_command_request`). Mirror `create_location` at baseline ~2089 and `create_order` at ~2269.
- Application roles have no table DML. Pin new RPCs in `tests/data-api-boundary.test.ts` and `tests/rls-command-boundary.test.ts`.
- Ledgers stay append-only. Corrections are named compensating commands, never `UPDATE`/`DELETE`.
- TDD: the failing vitest ships in the same PR as the RPC. CI's TDD gate already requires this for `lib/`, `scripts/`, `supabase/`.
- UI rendering is not unit-tested; prove it with the browse skill. Logic below the component boundary is.
- Do not edit `.agents/PROGRESS.md`, `.agents/MEMORY.md`, `.agents/DRIFT.md`. Progress goes in the PR description.
- After any new `defineCommand`/`defineQuery`, run `bun run docs:api` and the http-api maintainer contract (`tests/api-docs.test.ts`).
- Customer-visible behavior updates `content/docs/staff-guide.mdx` and/or `portal-guide.mdx` in the same PR.
- No new REST resource routes. No API keys. No generic entity DSL (v1 left that behind).
- `createAdminClient()` stays restricted to `lib/supabase/integration-tokens.ts` and `lib/chat/jobs.ts`.
- Commit messages have no `Co-Authored-By`.
- Sibling worktrees exist (`UX-work`, `backend-api`, `docs/ai-chat-spec`, …). Re-run `git status` and `git worktree list` before every commit. If a file changed under you, stop and re-baseline.

---

## Direction — confirm before any implementation

These are the forks I will not guess. Recommended answers are marked. A "proceed" that does not pick otherwise accepts the recommendations.

### D1. What "complete database integration" means in this pass

The live app already has Slice 1 / 1B against the current schema (catalog, inventory ledger, orders, portal, chat linking). The design inventory is 171 screens and 108 designed operations the registry does not answer. Migrating every later spec in one baseline edit, then wiring every screen, is how v1 got 276 migrations and a generic DSL.

| Option | Meaning |
| --- | --- |
| **A (recommended)** | A sequenced program: harness, then ordering-pilot gaps on the *current* schema, then bins, then catalog identity (brands/formats), then one domain program at a time. Each program is mergeable and demoable. |
| B | §16 one-pass (brands + formats + bins + channels + menus + taps + repack + invoice drift) as a single baseline PR, then wire screens. Matches §16.17's 2026-09-02 sentence, fights the later Ted-decided peel of bins/packaging/purchasing. |
| C | Schema-only: land every decided column/table now, leave screens gated and live pages as they are. |

### D2. Ordering pilot vs schema foundation

Ted (adversarial walkthrough, 2026-09-04): a complete ordering pilot ships first; production, inventory, and tap-board are next, in no fixed order. The user request is to unify screens/specs/plans with the database.

| Option | Meaning |
| --- | --- |
| **A (recommended)** | Program 1 finishes the ordering *job* on the current schema (Today, restock, short pick, delivery/invoice timing, portal account/invoice) so a brewery can run wholesale end-to-end against real data that matches the screens. Bins and brands come next because they are the foundations later slices cannot fake. |
| B | Skip ordering polish; start with bins + brands because those are the SCHEMA-GATEs the inventory already draws. |
| C | Brands/formats first (breaking catalog rename) before any more order work, so the live catalog never ships `products` as a public name. |

### D3. Live pages vs `screens.tsx`

`app/(app)/*` is a working Slice 1 UI (`CommandForm`, server `runCommand`). `components/mgr/screens.tsx` is the fixture source of truth for what each screen shows. They do not share bodies. `/` is still a stub `<h1>Dashboard</h1>` even though `get_today` is registered.

| Option | Meaning |
| --- | --- |
| **A (recommended)** | Screens stay fixtures. When a program ships a command, the live page is rewritten to the screen record (same `E.*` vocabulary, same fields/actions). Untouched pages stay as they are until their program. |
| B | Extract shared presentational components from screens now, then bind them. Larger refactor, higher drift risk while the inventory is still the design surface. |
| C | Keep Slice 1 pages; treat screens as docs-only until a later visual pass. Fastest backend, two products forever. |

### D4. Test isolation

AGENTS.md: when the backend push starts, tests get their own throwaway database and stop touching the dev one. Today `tests/helpers.ts` talks to the same local stack as `next dev`. Leftover `chat_installations` already time out `tests/chat-jobs.test.ts`.

| Option | Meaning |
| --- | --- |
| **A (recommended)** | Program 0 creates a second local database (`mgr_test`) on the existing Postgres, applies the same baseline, and points vitest at `DATABASE_URL` / a test-only env. `next dev` keeps 54342/`postgres`. CI already has a fresh stack; locally we stop resetting the brewery you are clicking. |
| B | Keep the shared stack; `db reset` is an accepted cost; add stricter test cleanup (especially chat). |
| C | Full second `supabase start` on different ports. Heaviest, cleanest, slowest to boot. |

### D5. Close §16.16 q1 now?

Screens already drew price tiers as **format default + per-SKU override** so Menu and POS item stay consistent (`components/mgr/screens.tsx` Price tiers spec). The schema spec still lists q1 as open.

| Option | Meaning |
| --- | --- |
| **A (recommended)** | Close q1 in the schema spec as part of Program 3: format default, SKU override. Do not re-open it during execution. |
| B | Leave q1 open and block Program 3 until a separate product call. |

### D6. Parked gates (do not un-park without a dedicated durability plan)

These stay registered-fail-closed or SCHEMA-GATE until their own plan exists. Confirm they are out of this unification program:

- `provision_brewery` (pre-tenant context)
- `invite_staff` / `invite_customer_user` (Auth-then-membership recovery)
- `import_csv` (per-logical-row RPC + durable request identity)
- `reverse_inventory_movement` (auditable compensation + TTB sign rules)
- `record_taproom_count` (durable count header/lines; zero-variance must not vanish)
- `complete_batch` / `reattribute_loss` (typed completion-loss identity)
- QBO push (`qbo_sync_token` / exact payload persistence) and Square sync
- AI `preview_command` / composer
- `taproom` staff role (RLS policies undesigned, §16.16 q3)
- Chat Tasks 11–14 (Slack actions, settings page, sandbox)

**Recommended:** yes, park all of the above. A SCHEMA-GATE in `screens.tsx` `writes` stays until that program is scheduled.

### D7. Open product questions that still block a later program

Not this pass, but do not "just pick" them during execution:

- §16.16 q2: does a poured format bind to one packaged format, or to a brand? Blocks `pos_menus`.
- §16.16 q3: taproom-role RLS. Blocks shipping the role chip.
- §16.16 q4: keg fill quarters/eighths vs weighing. Blocks tap-swap remaining input precision.
- DRIFT.md: `not_in_inventory` tap interval has no beer identity; taproom variance screens still do not post TTB removal types.

---

## Current state (evidence, 2026-09-07, `main` @ `76a15f8`)

### What is live (database + registry + app pages)

| Layer | Count / fact |
| --- | --- |
| Tables in `00001_baseline.sql` | 58 public + `private.command_requests` + `private.integration_tokens` + chat_sdk internals |
| Registered operations | **55** (`lib/commands/*.ts` via `all.ts`) |
| Fail-closed registered | `import_csv`, `invite_staff`, `invite_customer_user` |
| Staff app routes | catalog, inventory, orders (+pick/ship/adjust), pick sheet, replenishment, invoices + credit memo, customers, pricing, settings/team, settings/chat/link |
| Portal routes | shop/cart, orders, invoices, account (account page exists; `get_portal_account` does not) |
| Today | `get_today` RPC + command exist; `app/(app)/page.tsx` is a Dashboard stub |
| Chat | installation, linking, occurrences, deliveries, jobs — Tasks 1–10 of 14 |

Command modules today: `catalog`, `inventory`, `orders`, `customers`, `portal`, `chat`, `today`, plus fail-closed `import` and `invites`.

### What the screens and specs ask for that the database does not have

| Spec / screen gate | Database today | Owner |
| --- | --- | --- |
| §16.1 `products` → `brands` | `products` | Catalog identity |
| §16.2 / 16.2a / 16.12 formats, components, `format_bom`; SKU is brand × format | `skus.bbl_per_unit`, `sku_bom` | Catalog identity |
| §16.3 `sale_channels` table + tax treatment | `sale_channel` enum | Sale channels |
| §16.4 channel-scoped price tiers / format prices | `price_list_items` per SKU only | Catalog identity |
| §16.6 bins; locations spec **overrides** default-bin with seeded trio + min-of-one | no `bins`; FG has `location_id` only; materials and kegs are location-blind | Locations Program 2 |
| `location_kind = storage` | `warehouse \| taproom` | Locations |
| `stock_transfers` (not a third `order_kind`) | missing | Locations phase 2 |
| Packaging: `occupancy_id` nullable until start; `product_id`/`brand_id` not null | `packaging_runs.occupancy_id not null` | Production/packaging |
| `batches.intended_brand_id` nullable | `batches.product_id not null` | Production |
| Recipe assumption columns + ingredient extract snapshot | `recipe_versions.target_og/fg/abv` | Production SCHEMA-GATE |
| `vendors.lead_time_days`; drop `materials.lead_time_days` | column on `materials` only, unread | Purchasing |
| PO `sent_via` + delivery state; empty-PO trigger bug | `po_status` + `ordered_on` | Purchasing |
| Shipment on-delivery invoice timing | `ship_order` always invoices wholesale now | Ordering SCHEMA-GATE |
| Durable taproom count snapshot | missing | Parked |
| FG correction identity | missing | Parked |
| `keg_taps` / swap-as-primitive | missing | Taproom (after q4) |
| `repack` movement type + volume-neutral check | missing | Packaging |
| Invoice QBO drift columns | `qbo_sync_status` only | Parked with QBO |

### Designed operations (108) vs available (55)

Source of truth: `.agents/superpowers/plans/2026-09-06-api-operations-backlog.md` (generated from screens + registry). By area:

| Area | To build | Already built |
| --- | --- | --- |
| Portal | 2 | 7 |
| Orders & invoicing | 7 | 16 |
| Inventory & locations | 7 | 6 |
| Catalog & pricing | 11 | 7 |
| Team & brewery settings | 6 | 4 |
| Today & notifications | 7 | 6 |
| Purchasing & materials | 14 | 0 |
| Production | 16 | 0 |
| Packaging | 12 | 0 |
| Taproom & kegs | 10 | 3 |
| Delivery & routes | 7 | 0 |
| Compliance | 9 | 0 |

### Two UIs

Live pages use `CommandForm` and registry reads. They do not render `SCREENS`. Nav hides `planned: true` entries (`lib/mgr/nav.ts` + `shippedNav`). The design inventory shows the full rail.

---

## Patterns to mirror

| Category | Source | Pattern |
| --- | --- | --- |
| Naming | `lib/commands/catalog.ts:4-36` | `create_*` / `upsert_*` / `list_*` / `get_*`; camelCase input → `p_*` RPC args |
| Errors | `lib/commands/registry.ts:67-76` | `CommandError` + `rpcError`: 42501→403, MG409→409, PGRST116→404, P0001 keeps message, else generic 500 |
| Writes | `supabase/migrations/00001_baseline.sql` `create_location` / `create_order` | `assert_staff` → `claim_command_request` → domain work → `complete_command_request` |
| Queries | `lib/commands/inventory.ts:62-114` | RLS-bound `ctx.db.from(...)`; no RPC unless the shape is a view/function the screen needs |
| Tests | `tests/commands-catalog.test.ts` | `makeBrewery` + `makeStaffCtx` + `runCommand`; deny the wrong role on both registry and raw RPC |
| Boundary | `tests/rls-command-boundary.test.ts` | Matrix: command name, RPC name, allowed roles, input factory |
| Atomicity | `tests/write-atomicity.test.ts` | ≥2 supabase-js writes in one command block requires `.rpc(` or `// atomic-exempt:` |
| Docs | `lib/mgr/api-operations.ts` + `bun run docs:api` | Screens `reads`/`writes` + registry; never hand-edit ops markers |
| UI forms | `app/(app)/orders/order-form.tsx` | `CommandForm` sheet/dialog; disabled until submittable |
| Nav | `lib/mgr/nav.ts` | Flip `planned` off when the route ships; `tests/nav-ready-links.test.ts` |

If no similar command exists for an area, add `lib/commands/<area>.ts` and import it from `all.ts`. Do not dump brewing into `inventory.ts`.

---

## Maintenance extracts (land in Program 0, reuse forever)

These are the "best possible way for maintenance" the request asked for. They exist to make Programs 1–9 mechanical rather than heroic.

1. **Throwaway test database.** Vitest never shares the clicked-on brewery. Helpers read the test URL; `sql()` in schema tests already honors `DATABASE_URL`.
2. **Catalog/location seed helpers** in `tests/helpers.ts` (`seedCatalog`, `seedWarehouse`, `seedTaproom`, `seedCustomer`). Today ~12 test files insert `products`/`skus` by hand. Program 3's brands rename otherwise touches every file.
3. **New-write checklist test** that fails if a public `security definer` mutation is missing from: execute grant list, `tests/data-api-boundary.test.ts` allowlist, and `tests/rls-command-boundary.test.ts` matrix. Closes the "forgot the matrix row" class of bugs.
4. **Slice file map** (this plan §File map). One area = one command module + one test file + screens ungate + docs:api.
5. **Screens stay fixtures.** A live page may import `E` and `CommandForm`; it must not import a `SCREENS` body. Binding fixtures to the database is how the inventory stops being a design contract.
6. **Gate comments stay honest.** Removing a `SCHEMA-GATE` from `writes` without a registered command makes `tests/api-docs.test.ts` list it as designed — fine — but a new test (`tests/screen-command-gates.test.ts`) fails if a write is *ungated* and unregistered.
7. **No aliases.** `tests/api-docs.test.ts` already bans `create_customer` vs `upsert_customer`. New screens use the registry name.

---

## File map (locked for the whole program)

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00001_baseline.sql` | Schema, RLS, grants, RPCs, views, triggers. In-place only. |
| `lib/commands/registry.ts` | `defineCommand` / `defineQuery`, `Ctx`, `CommandError`. Do not put domain here. |
| `lib/commands/all.ts` | The one side-effecting import list. |
| `lib/commands/<area>.ts` | Area handlers. New areas: `packaging.ts`, `production.ts`, `purchasing.ts`, `taproom.ts`, `delivery.ts`, `compliance.ts`, `settings.ts`. |
| `tests/helpers.ts` | Tenant/user factory + catalog/location seeds. |
| `tests/<area>.test.ts` / existing `tests/commands-*.test.ts` | Behavior against real Postgres. |
| `tests/rls-command-boundary.test.ts` | Role × RPC matrix. |
| `tests/data-api-boundary.test.ts` | No table DML; allowlisted RPCs. |
| `tests/schema-rules.test.ts` / `schema-conventions.test.ts` / `schema-rls-indexes.test.ts` | pg_catalog gates. |
| `components/mgr/screens.tsx` | Fixture inventory; ungate `writes` when the command exists. |
| `lib/mgr/nav.ts` | Flip `planned` off when the route exists. |
| `app/(app)/<area>/` | Live staff pages. Thin: query + `CommandForm`. |
| `app/(portal)/` | Live portal. Customer-role commands only. |
| `content/docs/{staff,portal}-guide.mdx` | Customer-visible behavior. |
| `content/docs/api.mdx` | Regenerated ops blocks only. |

---

## Program plans (TDD, 2026-09-07)

Each program is a separate writing-plans artifact. Execute in order. Program 0 is specified in this file; 1–9 are:

| Program | Plan |
| --- | --- |
| 0 Harness | this file, §Program 0 |
| 1 Ordering pilot | `.agents/superpowers/plans/2026-09-07-backend-program-1-ordering-pilot.md` |
| 2 Locations / bins / transfers | `.agents/superpowers/plans/2026-09-07-backend-program-2-locations-bins.md` (phase 1 still `.agents/superpowers/plans/2026-09-06-locations-bins-phase1.md`, retargeted) |
| 3 Catalog identity | `.agents/superpowers/plans/2026-09-07-backend-program-3-catalog-identity.md` |
| 4 Sale channels | `.agents/superpowers/plans/2026-09-07-backend-program-4-sale-channels.md` |
| 5 Production / packaging | `.agents/superpowers/plans/2026-09-07-backend-program-5-production-packaging.md` |
| 6 Purchasing | `.agents/superpowers/plans/2026-09-07-backend-program-6-purchasing.md` |
| 7 Keg fleet | `.agents/superpowers/plans/2026-09-07-backend-program-7-taproom-kegs.md` |
| 8 Delivery routes | `.agents/superpowers/plans/2026-09-07-backend-program-8-delivery-routes.md` |
| 9 Compliance | `.agents/superpowers/plans/2026-09-07-backend-program-9-compliance.md` |
| 10 Explorer parity | `.agents/superpowers/plans/2026-09-07-backend-program-10-explorer-parity.md` |
| 11 Invites / import / provision | `.agents/superpowers/plans/2026-09-07-backend-program-11-access-import.md` |
| 12 Taproom counts + tap board | `.agents/superpowers/plans/2026-09-07-backend-program-12-taproom-truth.md` |
| 13 QuickBooks | `.agents/superpowers/plans/2026-09-07-backend-program-13-quickbooks.md` |
| 14 Square / menu | `.agents/superpowers/plans/2026-09-07-backend-program-14-square-pos.md` |
| 15 Composer | `.agents/superpowers/plans/2026-09-07-backend-program-15-composer.md` |
| 16 Chat settings | `.agents/superpowers/plans/2026-09-07-backend-program-16-chat-settings.md` |

Coverage map (every `SCREENS` name): `.agents/superpowers/plans/2026-09-07-backend-explorer-remainder.md`. Slack/QBO/Square **venue** frames are not a program.

## Programs

Each program is a PR stack (or one PR if small). Independent after Program 0. Do not start the next until the previous is green on `bunx tsc --noEmit`, `bun run lint`, the program's vitest files, and a browse pass of the pages it touched.

### Program 0 — Harness (this worktree, first PR)

**Why first:** every later schema edit currently `db reset`s the brewery on screen, and the brands rename will otherwise be a 12-file test rewrite.

**Files:** `tests/helpers.ts`, `vitest.config.mts`, `scripts/` (test-db bootstrap), `.env.example`, `README.md` (test DB), new `tests/screen-command-gates.test.ts`, new seed helpers, AGENTS.md current-focus sentence (execution PR, not this plan PR).

### Program 1 — Ordering pilot on the current schema

**Why now:** Ted's pilot; schema already has orders, allocations, picks, ships, invoices, credit memos, portal, `needs_restock`, `short_reason`. The holes are commands and pages, plus two small schema adds.

Ship:

- Today page calls `get_today` (already registered). Flip nothing in schema.
- `confirm_restock`, `resolve_short_pick`, `release_allocation`, `get_shortfalls`
- `confirm_delivery` + persist invoice timing on `shipments` (the SCHEMA-GATE `ship_order` names). Until this column exists, the on-delivery ship body stays gated.
- `return_shipment` as the named correction over the existing `create_credit_memo` path (do not invent a second ledger write)
- Portal `get_portal_account`, `portal_invoice`
- `update_location` (settings already draw it)
- Invoice questions (`raise` / `list` / `resolve`) and `write_off_invoice` only if they can be one RPC each with current `invoices` columns; otherwise they wait for a one-page spec. **If unsure at execution time, park them and say so — do not invent a questions table in passing.**

Out of this program: bins, brands, invites, import, QBO.

### Program 2 — Locations, bins, transfers

Execute `.agents/superpowers/plans/2026-09-06-locations-bins-phase1.md` **in this worktree** (its header still names the retired `docs/locations-bins` worktree — ignore that path). Then phase 2 (`stock_transfers`) and phase 3 (delivery polymorphism) from the spec.

Do not re-key `taproom_pars` here (spec defers it). Do not add bin `kind` (spec Decision 1).

### Program 3 — Catalog identity (brands, formats, BOM, price tiers)

§16.1, 16.2, 16.2a, 16.4, 16.12. Breaking rename. Relies on Program 0 seed helpers.

- `products` → `brands`; `create_product` → `upsert_brand` / `list_brands` (retire the old names; `tests/api-docs.test.ts` alias rule)
- `formats` + `format_components`; `skus` becomes `(brand_id, format_id)`; `enforce_bbl_integrity` reads format
- `sku_bom` → `format_bom`
- Price: format default + SKU override (D5)
- Packaging run `product_id` becomes `brand_id` in the same pass if Program 5 has not already done packaging source planning; otherwise coordinate so the column is not renamed twice

### Program 4 — Sale channels

Reconcile `docs/plans/sale-channels-customizable.md` with §16.3 tax treatment. Seed four defaults by trigger on `breweries` insert. `ship_order_impl` stops hardcoding `'wholesale'`.

### Program 5 — Production and packaging

Recipes (assumption columns SCHEMA-GATE — land the columns, drop stored OG/FG/ABV), vessels, occupancies, brew day, cellar transfer, fermentation readings, packaging source planning (nullable `occupancy_id` + required brand, check on start/close), `schedule_packaging_run` / `close_packaging_run` / `record_repack`.

`complete_batch` and `reattribute_loss` stay gated until their identity spec exists.

### Program 6 — Purchasing

`.agents/superpowers/specs/2026-09-07-mgr-purchasing-send-and-lead-times.md`: move `lead_time_days` to `vendors`, PO send transports, `vendor_lead_times` view, open-balance view, empty-PO trigger guard, contract drawdown honesty. `transmit_purchase_order` is External/copper and needs the same durable outbound identity as QBO — **if Resend is not approved as a dependency, ship `mailto` + `external` only and leave `direct` gated.**

### Program 7 — Taproom and kegs

Keg pools/events with location+bin (after Program 2), fleet screens. Tap board / `keg_taps` / swap wait on D7 q2/q4 and the durable count gate. Do not ship `staff_role = taproom`.

### Program 8 — Delivery and routes

Depends on Program 2 phase 3. `save_route`, `depart_route`, `return_route`, driver screens. `confirm_delivery` may already exist from Program 1; this program attaches it to routes.

### Program 9 — Compliance

`generate_compliance_report` / `file_compliance_report` / registry / COLA as `brand_approvals`. Loss review stays gated.

---

## Program 0 — tasks (the only tasks to execute after confirmation)

### Task 0.1: Throwaway test database

**Files:**
- Create: `scripts/test-db.sh` (create `mgr_test`, apply `00001_baseline.sql`, emit env)
- Modify: `vitest.config.mts`, `tests/helpers.ts`, `.env.example`, `README.md` Setup/tests section
- Test: `tests/helpers.test.ts` (new) — or a one-shot assertion in `tests/schema-rules.test.ts` that `current_database()` is `mgr_test` when `MGR_TEST_DB=1`

**Interfaces:**
- Produces: vitest talks to `postgresql://postgres:postgres@127.0.0.1:54342/mgr_test` (same Postgres, different database). `next dev` unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/helpers.test.ts — backend tests must not share the app database.
import { describe, expect, it } from "vitest";
import { sql } from "./helpers";

describe("test database isolation", () => {
  it("runs against mgr_test, not the app database", () => {
    expect(sql("select current_database()")[0]).toBe("mgr_test");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/helpers.test.ts`
Expected: FAIL — `current_database()` is `postgres`.

- [ ] **Step 3: Bootstrap `mgr_test` and point helpers at it**

`scripts/test-db.sh` creates the database if missing and runs the baseline (and `supabase/seed.sql` only if tests need it — prefer empty + `makeBrewery`). `tests/helpers.ts` `DB` default becomes the test URL. Vitest loads `.env.test.local` if present, else the test URL. Document: copy `.env.local` into this worktree (gitignored; worktrees do not inherit it).

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/test-db.sh && bunx vitest run tests/helpers.test.ts tests/schema-rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-db.sh tests/helpers.ts tests/helpers.test.ts vitest.config.mts .env.example README.md
git commit -m "test: run vitest against a throwaway mgr_test database

tests/helpers.test.ts"
```

### Task 0.2: Catalog and location seed helpers

**Files:**
- Modify: `tests/helpers.ts`
- Modify: the test files that insert `products`/`skus`/`locations` by hand (list in the commit)
- Test: `tests/helpers.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export async function seedCatalog(breweryId: string, opts?: { product?: string; sku?: string; packageType?: "keg" | "can" | "bottle"; bblPerUnit?: number }): Promise<{ productId: string; skuId: string }>
export async function seedLocation(breweryId: string, opts?: { name?: string; kind?: "warehouse" | "taproom" }): Promise<{ id: string; name: string; kind: string }>
export async function seedCustomer(breweryId: string, opts?: { name?: string; state?: string; priceListId?: string }): Promise<{ customerId: string; shipToId: string; priceListId: string }>
```

After Program 3, `seedCatalog` writes `brands` + `formats` + `skus` and still returns `{ productId, skuId }` only if we keep a compatibility alias — **do not**. Program 3 changes the return to `{ brandId, skuId, formatId }` and updates callers. The helper exists so that change is one function.

- [ ] **Step 1: Failing test** — `seedCatalog` returns ids that `list_products` (today) can see.
- [ ] **Step 2: Implement helpers; replace hand inserts in command/RLS tests.** Leave `data-api-boundary`'s forbidden `from("products").insert` — that test *is* the DML denial.
- [ ] **Step 3: `bunx vitest run tests/commands-catalog.test.ts tests/commands-orders.test.ts tests/helpers.test.ts`**
- [ ] **Step 4: Commit**

### Task 0.3: Ungated screen writes must be registered

**Files:**
- Create: `tests/screen-command-gates.test.ts`
- Test: that file

```ts
// tests/screen-command-gates.test.ts — an ungated screen write is a product
// promise. If it is not in the registry, the page cannot do what the inventory
// shows.
import { describe, expect, it } from "vitest";
import { SCREENS } from "@/components/mgr/screens";
import { getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";

const GATE = /\[(SCHEMA-GATE|IMPLEMENTATION-GATE)/i;

function writeNames(writes: unknown): string[] {
  if (typeof writes !== "string") return [];
  return writes.split("·").flatMap((part) => {
    if (GATE.test(part) || /\[(client state|platform|view|design)/.test(part)) return [];
    const name = part.trim().match(/^([a-z_]+)/)?.[1];
    return name && name.includes("_") ? [name] : [];
  });
}

describe("ungated screen writes", () => {
  it("are registered commands", () => {
    const missing: string[] = [];
    for (const screen of SCREENS) {
      for (const name of writeNames(screen.writes)) {
        if (!getCommandDefinition(name)) missing.push(`${screen.name}: ${name}`);
      }
    }
    expect(missing, "ungate the screen only after the command exists").toEqual([]);
  });
});
```

- [ ] Run and fix any current ungated-but-unregistered names by **restoring the gate comment**, not by stubbing commands. Stubs are how `import_csv` happened; we do not add more fail-closed names unless audit requires it.
- [ ] Commit

### Task 0.4: Public mutation RPCs appear in the boundary tests

**Files:**
- Modify: `tests/data-api-boundary.test.ts` and/or a new `tests/rpc-allowlist.test.ts` that reads `pg_proc` / grants and diffs against a listed set (the existing files already pin names — extract the list to one module both import).

Do not overbuild. If the existing tests already fail when a grant is added without a pin, document that in README and skip a new file.

- [ ] Commit only if a real gap exists.

---

## Program 1 — full TDD plan

See `.agents/superpowers/plans/2026-09-07-backend-program-1-ordering-pilot.md`. Do not execute from a sketch.

---

## Validation (every program)

```bash
pwd && git branch --show-current   # must be .../backend and backend
bash scripts/test-db.sh            # after Program 0
bunx vitest run tests/<this-program>.test.ts tests/rls-command-boundary.test.ts tests/data-api-boundary.test.ts tests/schema-rules.test.ts tests/api-docs.test.ts tests/screen-command-gates.test.ts
bunx tsc --noEmit
bun run lint
bun run docs:api                   # if commands or screen reads/writes changed
# browse: open the live pages this program touched, phone + desk, empty + error + happy
```

CI (`bun run test`, lint, tsc, `next build`) remains the merge gate. Database-backed suites run there on a fresh stack; locally after Program 0 they run on `mgr_test`.

---

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| One baseline file, many worktrees | High | Only this `backend` worktree edits `00001_baseline.sql`. Rebase onto `main` before every schema commit. |
| Shared local Postgres during Program 0 | High | Test DB is the first task. Until it lands, do not `db reset` without saying so. |
| Brands rename breaks every catalog test | High | Seed helpers in Program 0; rename is then one function. |
| §16 "one pass" vs later peeled specs | Medium | Follow the later Ted-decided specs (bins, packaging, purchasing). Treat §16.17 as historical build-order advice, not a single PR. |
| Inventing tables for invoice questions / chat settings | Medium | Park when the screen is ahead of the schema spec. Come back. |
| Two UIs forever | Medium | D3A: rewrite the live page when we touch it. |
| `direct` PO email without Resend approval | Medium | D6/Program 6: mailto + external first. |
| Chat-jobs pollution while tests still share a DB | High until 0.1 | Known; disconnect leftover installations or wait for `mgr_test`. |
| Opening taproom role with P-staff | High | Enum value does not ship until RLS is designed. |
| Scope explosion to QBO/Square/AI | High | D6 park list. A screen remaining gated is success, not failure. |

## v1 cross-check (folded in, not a separate pass)

Adopt: iron rule 5 (already), brewing-domain, schema-rules tests, baseline-in-place, confirm-gated AI (still a gate, not this program), durable outbound identity for any vendor POST (QBO and `transmit_purchase_order`).

Do not repeat: generic entity DSL, client-side writes, migration chain, vessel status machine, three-way enums, React Query key catalog, entity_revisions on every row, Square/QBO before an ordering user exists, mocked Supabase.

---

## Acceptance

- [ ] Direction forks D1–D7 confirmed (or explicitly overridden)
- [ ] Program 0 merged on `backend` (or stacked PRs) with throwaway test DB and seed helpers
- [ ] Each later program has its own writing-plans artifact before execution
- [ ] No new fail-closed command names
- [ ] No second migration file
- [ ] Screens ungated only when the command is registered and the live page matches the record
- [ ] `bun run docs:api` clean; staff/portal guides updated per program
- [ ] Parked gates still parked

---

## Execution choice (after confirmation)

Program 0 is small enough for inline execution in this session.

Programs 1–9: subagent-driven, one program at a time, with a writing-plans file per program (locations phase 1 already exists — retarget its worktree line to `.agents/worktrees/backend`).
