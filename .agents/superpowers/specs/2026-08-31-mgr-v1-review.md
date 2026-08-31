# MGR v1 (`~/Repos/mgr`) — what to keep, what to leave

Date: 2026-08-31
Status: Reviewed with Ted 2026-08-31. §3 items 1–4 adopted (iron rule 5, `brewing-domain.md`, `tests/schema-rules.test.ts`, gotchas in `.agents/MEMORY.md`); items 5–6 pending their slices.

v1 shape: Jan–Aug 2026, 832 commits, ~123k LOC in `src/`, **276 migrations / 281 SQL
functions**, 270 test files, 16 CI workflows, 40 generic-entity configs. It ended
**single-tenant** (migration 00002 removed `brewery_id`; 00247 was still cleaning up the
dead tenancy helper). Its schema, RLS and UI framework are therefore not transplantable;
its *lessons* and its *domain knowledge* are.

## 1. Pull in (genuinely good)

| # | Item | Where in v1 | Why | Cost |
|---|---|---|---|---|
| 1 | **Multi-write commands are one Postgres function** | DECISIONS.md 2026-07-15 ×6; `00256–00265` | supabase-js can't span a transaction. v1 shipped client-sequenced writes and spent July–Aug retrofitting RPCs after real data loss (recipe save partial commit, Square refund unit loss, Square double-allocation, QBO token last-write-wins). mgr2 slice 1A is all single-row inserts so it hasn't bitten yet; `confirm order` (allocations + status) and `ship` (movements + allocation fulfil + status + invoice) will. Make it iron rule 5: *a command that writes more than one row calls one `security invoker` plpgsql function; the handler is the thin caller.* | Rule + one plpgsql function per multi-write command; test enforces it |
| 2 | **Idempotency on external side-effects** | DECISIONS.md "QuickBooks creates use durable request identities" | POST to QBO + local mapping write can't share a transaction. Persist outbound payload + deterministic `requestid` before sending; retry with the same id. Applies directly to mgr2 §5 QBO push. | Design note in the QBO slice; no schema now |
| 3 | **`docs/knowledge/brewing-domain.md`** (37 dense lines) | v1 `docs/knowledge/` | TTB report identities, "taproom sales are taxpaid removals, never samples", removal month = completion date, loss-reconciliation thresholds (≥ max(0.05 bbl, 0.5%)), cross-foot check, yeast viability constants. Months of correction baked in. | Copy verbatim; strip the v1-specific paragraphs (entity_revisions, `get_ttb_report`) |
| 4 | **`docs/spec/workflows.md` TTB line mapping (lines 167–235) + allocation-type matrix** | v1 `docs/spec/` | Maps movement types → BRO lines. mgr2 slice 6 needs this exactly. | Copy the table into the compliance spec when slice 6 starts |
| 5 | **RLS-exception comments + coverage test** | `00198`, `src/__tests__/integration/rls-coverage.test.ts` | Any permissive policy must carry `COMMENT ON POLICY … 'RLS-EXCEPTION: …'` or CI fails. Turns "every table has RLS" from prose into a gate — exactly what ARCHITECTURE.md rule 3 asks for. | ~40-line vitest query over `pg_policies` |
| 6 | **DB rule scripts that replaced prose** | `scripts/check-security-invoker`, `check-search-path`, `check-security-definer`, `check-permissive-rls`, `check-write-atomicity` | Each was written after a Supabase advisor finding or a bug. Fold into one `tests/schema-rules.test.ts` reading `pg_catalog` (views have `security_invoker`, functions have `set search_path`, no `security definer` without a comment). | One test file |
| 7 | **Replay migration chain from scratch in CI** | `db-lint.yml` | mgr2 CI already runs tests against local Supabase; make sure `supabase db reset` (not `db push` on a warm DB) is what CI does, so the baseline is always proven from zero. | Verify `.github/workflows/ci.yml` |
| 8 | **Postgres integration tests via raw `pg` + `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims`** | `__tests__/integration/_helpers/role-client.ts` | Tests RLS without GoTrue round-trips: faster, deterministic UUIDs, real transactions with lock timeouts. mgr2 tests currently go through supabase-js + auth; keep that for command tests, adopt this for RLS/schema tests when suite time matters. | Defer until suite > ~30s |
| 9 | **`generate_next_number()` with `pg_advisory_xact_lock`** | `00142` | Order/invoice numbers (`ORD-YYYYMMDD-NNN`) without gaps or races. | 15 lines of plpgsql in the baseline when orders land |
| 10 | **PG error code → typed error mapping** | `lib/pg-error-codes.ts`, `parseSupabaseError` | `23505` → "already exists", `23503` → "referenced", `42501` → "not permitted". Makes `CommandError` messages honest without per-handler try/catch. | ~30 lines in `registry.ts` `unwrap` |
| 11 | **Confirm-gated AI writes** | `app/api/chat/write/route.ts` | Tools *propose*; a second endpoint re-validates with zod and runs the permission check. Matches mgr2's `requiresConfirmation` intent; the two-endpoint shape is the concrete design. | Slice-1 AI chat design |
| 12 | **`DECISIONS.md` entry format** | Decision / Why / Alternatives rejected / Reversibility | mgr2 has `.agents/MEMORY.md` for this; adopt the four-field format for entries there. | Formatting only |
| 13 | **`docs/agents/gotchas.md`** | v1 | PostgREST stale schema cache after DDL, `Unregistered API key`, migration-number collisions. Tell-based, high value per line. | Copy the still-true entries into `.agents/MEMORY.md` |
| 14 | **Migration guards that abort if data exists** | `00294`, `00297` | Pattern for the post-deploy era: destructive DDL wrapped in `if exists (select 1 from …) then raise`. | Note in schema-decisions doc |

Domain facts from `docs/knowledge/entity-model.md` worth confirming against mgr2's decisions
(they agree, which is reassuring): FG quantity = packaged count, never decremented; available
= packaged − open allocations; fulfilment completes the allocation *and is* the TTB removal;
keg balances derive from a transaction ledger; per-owner deposits override the container
default; "no default price tier per channel" (a customer needs both tier and channel or gets no
auto-price — mgr2's "price lists are the tiers" simplifies this correctly).

## 2. Leave behind (debt, or mgr2 already has the better plan)

| Item | v1 evidence | mgr2's answer |
|---|---|---|
| Generic entity DSL (`types/entity.ts` 1,017 lines; `entity-detail-unified.tsx` 2,105; `entity-data-table.tsx` 1,378) | 34 `component:` escape hatches, 187 bespoke domain components; only 14/71 list pages stayed generic; re-cut three times | Spec §Engineering principles: shadcn primitives → small composed components; UI may repeat until rule of three |
| Client-side writes (browser `insert`/`update`, RLS as only server rule) | Zero `"use server"`; validation only in-browser zod | Command registry with server-side zod + role check (iron rule 1) |
| Migration chain (276 files, 7 renumberings, 6 "capture from live" drift migrations, `repair-migration-renumbering.sql`, `keg_owner_deposits.keg_type_id` NOT NULL bug latent for 200 migrations) | #381 #545 #920 #711 | Single baseline edited in place until deploy |
| Tenancy flip-flop (multi → single → settings singleton → `system_settings`) | 00001 → 00002 → 00043 → 00247 | `brewery_id` + RLS everywhere in both deployment modes, composite FKs |
| Vessel status state machine (`dirty → caustic_cleaned → ready → in_use`) | workflows.md | "no status column that won't be kept accurate" |
| Three-way enum storage (`enum_values` table + PG enums + TS) | 00037/38/39/50 fix-ups | PG enums only, generated types |
| React Query + 777-line `query-keys.ts` | 142 files; eslint rule to ban inline keys | Server Components + optimistic command result; no client cache library |
| `entity_revisions` full-row audit on every change | 00019; later used to reconstruct TTB in-process figures | Append-only ledgers *are* the audit; add a revisions table only if a non-ledger entity needs history |
| Agent-harness sprawl: 16 CI workflows (10 scheduled Claude agents), `tools/codegraph` (2,810 lines, 46 bot commits, merge-looped on its own metadata), autoharness ×4 files, `feature_list.json` + 5 check scripts, PROGRESS.md 388 KB via 216 fragment files + `merge=union` | AGENTS.md spent ~30 lines explaining the WIP tracker; "quality-regrade ran 10 times producing nothing" | `AGENTS.md` ≤ 60 lines, one CI workflow, `PROGRESS.md` one line per item, worktrees under `.agents/worktrees/` |
| Instruction-file churn (CLAUDE.md edited 42×, deleted, recreated; AGENTS.md back to 280 lines) | DECISIONS 2026-05-02 | Enforce rules with eslint/tests, not prose (already the ARCHITECTURE.md stance) |
| Integrations before users: MongoDB legacy sync (1,361 lines), Slack, Square, notifications, COGS/projection reports, 25 AI tools | 281 SQL functions | Slice order in the design spec; Square is slice 7, nothing before its slice |
| Mocked-Supabase component tests | test the mock's shape and the DSL's branches | `tests/` hit the real DB (already the rule) |
| Dependencies with one consumer: `mongodb`, `square`, `recharts`, `@dnd-kit/*`, `nuqs`, `streamdown`+4 plugins+`shiki`, `uuid`, `pino`, `input-otp`, `read-excel-file`, 14 `overrides` pins | knip: 134 unused exports | mgr2 has 14 deps; adding one is "ask first" |
| Bun + Make front door | Make wrapped bun which wrapped scripts | `npm` scripts; three commands in AGENTS.md |

## 3. Proposed next actions (in order, each small)

1. Add iron rule 5 (multi-write = one plpgsql function) to `ARCHITECTURE.md` and the
   schema-decisions doc; enforce with a test that flags command handlers with >1
   `.insert/.update/.delete/.upsert` and no `.rpc(`.
2. Copy `brewing-domain.md` → `.agents/superpowers/specs/brewing-domain.md`, trimmed.
3. `tests/schema-rules.test.ts`: every table in `public` has RLS enabled; every permissive
   policy has an `RLS-EXCEPTION` comment; every view is `security_invoker`; every function
   sets `search_path`.
4. Pull the still-true gotchas into `.agents/MEMORY.md`.
5. When orders land: `next_number()` advisory-lock function; PG-error mapping in `unwrap`.
6. When QBO lands: request-id idempotency per the v1 decision.
