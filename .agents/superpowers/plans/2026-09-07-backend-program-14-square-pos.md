# Program 14 — Square POS, menus, and mappings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Square, map each location to one MGR location, map each variation to a format/SKU, ingest raw `pos_sales`, and publish a menu whose availability is **derived from bin stock**. Square never posts taproom depletion (Program 12 owns that).

**Architecture:** Tokens through `lib/supabase/integration-tokens.ts` (`"pos"`). `pos_sales` already exist as raw facts. Add `external_variation_id` to mappings (§16.5). `pos_menus` as §16.7. Poured format binds to one packaged format (remainder q2 default) so a pint depletes the keg SKU's expected column only — **still not a ledger write**.

**Tech Stack:** Square API via `fetch` (ask before adding the Square SDK). Env: `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, `SQUARE_ENVIRONMENT`.

**Spec:** §16.5, §16.7, §16.14. Screens: Point of sale, Connect Square, Square locations, Disconnect, Menu, POS item, POS mapping, POS sale detail. Connector to QBO is a **note + deep link**, not a second integration.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Program 12 counts must exist so POS expected is meaningful. Program 3 formats. q2 default: poured → one packaged format.
- Unmapped items: `ignored` or `queued` per §16.14 — person chooses; guest/event Square items are **ignored**, never mapped.
- One Square location → one MGR location; second claim 409.
- ListLocations on every sync; new locations appear unmapped.
- TDD, docs:api, staff-guide. Ask before adding `square` npm package.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | `external_variation_id`, `pos_menus`, `pos_menu_lines`, poured `packaged_format_id` on formats |
| `lib/pos.ts` | Square fetch wrapper |
| `lib/commands/pos.ts` | connect, map location, map item, ingest, menu queries |
| `app/(app)/settings/pos/`, `app/(app)/menu/` | screens |
| `tests/pos.test.ts` | Proof |

---

### Task 1: Variation-level mapping + location uniqueness

**Files:** baseline, commands

**Interfaces:**
- `pos_item_mappings` unique `(connection_id, external_item_id, external_variation_id)`
- `map_pos_location({ posLocationId, mgrLocationId })` — 409 if mgr location already claimed
- `map_pos_variation({ externalItemId, externalVariationId, skuId?, formatId?, qtyPerSale, disposition: "mapped"|"ignored" })`

- [ ] **Step 1:** Two Square locations cannot map to the same MGR location. A pint variation maps to a poured format bound to the half-bbl packaged format.

- [ ] **Step 2–5:** Add `formats.packaged_format_id` nullable FK for poured rows (q2). Commit `feat(pos): variation mappings and one Square location per MGR location`

---

### Task 2: Ingest sales (raw facts only)

**Files:** `ingest_pos_sales` RPC — inserts `pos_sales` rows, does **not** insert `inventory_movements`.

- [ ] **Step 1:** Ingest 3 sales; on-hand unchanged; `pos_unmapped_items` lists an unknown variation; count expected (Program 12) includes mapped sales.

- [ ] **Step 2–5:** Commit `feat(pos): ingest raw sales without posting depletion`

---

### Task 3: `pos_menus` derived availability

**Files:** `pos_menus (location_id, bin_id, channel_id)`, lines are formats in that bin with price from Program 3/4. Query `get_pos_menu({ locationId })` — no hand-flipped availability.

- [ ] **Step 1:** Empty bin → poured format absent from menu. Stock in Walk-in → present. Price is format default.

- [ ] **Step 2–5:** Commit `feat(pos): menu availability is bin stock`

---

### Task 4: Pages, ungate, docs

Point of sale, Connect, Square locations (shared entity picker), Menu, POS item, mapping, sale detail. Connector screen is copy + link to Intuit, not a sync job. `bun run docs:api`. Browse.

Commit `docs: Square and menu screens live`

---

## Validation

```bash
bunx vitest run tests/pos.test.ts tests/taproom-count.test.ts tests/rls-integration-secrets.test.ts
bunx tsc --noEmit && bun run lint
```

## Acceptance

- [ ] Square sales never insert FG movements
- [ ] Unmapped guest items can be ignored
- [ ] Menu cannot offer a pour the bin cannot support
