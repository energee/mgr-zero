# Program 9 — Compliance registry and filings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can record COLA/formula approvals, state registrations, and brewery licenses against **brands**, generate a period report from the ledger, and file an immutable snapshot. MGR does not transmit.

**Architecture:** Tables exist (`brand_approvals` after Program 3 rename, `state_registrations`, `brewery_state_licenses`, `report_filings`). This program is RPCs + queries + the Compliance screens. Loss reattribution stays SCHEMA-GATE.

**Tech Stack:** Same as Program 1. New `lib/commands/compliance.ts`.

**Spec:** Schema §14 filings. `brewing-domain.md` TTB identities. UI plan Compliance month. Parent plan. Program 3 `brand_approvals`.

## Global Constraints

- Worktree `.agents/worktrees/backend`. Program 3 required (brands). Program 4 tax_treatment on movements is required for honest figures.
- Generated figures are a **query** over the ledger. Filed figures are a **jsonb snapshot** on `report_filings`. Editing a channel later must not change a filed month.
- Save stays disabled unless the generated report balances (cross-foot per brewing-domain). Pin the identity checks in the generate function, not in the React page.
- Zeros print `0.00`, never blank — in the JSON snapshot.
- No `v_bro` view standing in for generator code (UI plan §8).
- Parked: `reattribute_loss`, `get_loss_review`, any "email to TTB".
- TDD, docs:api, staff-guide, nav Compliance `planned` off.

## File map

| File | Responsibility |
| --- | --- |
| `00001_baseline.sql` | RPCs; `generate_compliance_report` SQL function returning jsonb |
| `lib/commands/compliance.ts` | upserts, generate, file, list, trace_lot |
| `app/(app)/compliance/` | registry, month, lot trace |
| `tests/compliance.test.ts` | Proof |

---

### Task 1: Registry upserts

**Files:** compliance.ts, RPCs

**Interfaces:**
- `upsert_brand_approval({ id?, brandId, kind: "cola"|"formula", ttbId, approvedOn?, expiresOn?, note? })` admin/sales
- `upsert_state_registration({ brandId, state, registrationNo?, approvedOn?, expiresOn? })`
- `upsert_brewery_state_license({ state, kind, licenseNo?, expiresOn?, note? })`
- `get_compliance_registry` — brands with approvals, registrations, brewery licenses
- Unique keys already on the tables.

- [ ] **Step 1:** Insert COLA for a brand; duplicate `(brand_id, kind, ttb_id)` raises 23505 mapped to conflict. Sales can upsert; warehouse denied.

- [ ] **Step 2–5:** Commit `feat(compliance): brand approvals, registrations, licenses`

---

### Task 2: `generate_compliance_report`

**Files:** SQL function + query wrapper

**Interfaces:**
- `generate_compliance_report({ jurisdiction: "TTB"|"US-PA"|…, periodStart, periodEnd }) => { figures: { removals: Record<string, number>, inProcess: number, packaged: number, balances: boolean, lines: … }, warnings: string[] }`
- Figures from `inventory_movements` in the period: `sale_removal` by frozen `tax_treatment` and `dest_state`; `depletion` taproom taxpaid; `destruction`/`loss`/`sample`/`festival_removal` as brewing-domain classes; `production_in` packaged. Volumes in bbl.
- `balances` is true iff opening + production − removals = closing (all computed, not stored).
- Does **not** write `report_filings`.

- [ ] **Step 1:** Seed opening_balance, production_in, sale_removal taxable PA, export. Generate TTB month. Expect packaged, taxable removal, export removal, `balances: true`. Then update the Export channel's tax_treatment (if Program 4 allows — movement is frozen so the report must **not** change).

- [ ] **Step 2–5:** Implement in plpgsql as one function the query calls (`security invoker` is enough if it only reads RLS-visible movements; otherwise definer that still filters `is_staff_of`). Commit `feat(compliance): generate a period report from the ledger`

---

### Task 3: `file_compliance_report`

**Files:** compliance.ts

**Interfaces:**
- `file_compliance_report({ jurisdiction, periodStart, periodEnd, note? })` — calls generate, raises if `balances` is false, inserts `report_filings` snapshot (`figures` jsonb, `filed_at now()`, `filed_by auth.uid()`). Unique `(brewery, jurisdiction, period)` — replay same requestId returns the row; a new requestId for the same period conflicts.
- `list_compliance_reports`

- [ ] **Step 1:** File succeeds when balanced; fails when a movement is missing dest_state so the report does not balance (force by inserting an adjustment? or skip — test the raise path by stubbing figures via a period with no opening that still cross-foots). Simpler: generate on empty brewery balances at 0 and can file zeros. Second file same period different requestId → conflict.

- [ ] **Step 2–5:** Commit `feat(compliance): file an immutable snapshot`

---

### Task 4: `trace_lot`

**Files:** compliance.ts

**Interfaces:**
- `trace_lot({ lotId }) => { lot, packagingRun, occupancy, batch, movements: { id, type, qty, locationId }[] }`
- Follow FKs: lot → packaging_run → occupancy → batch; movements where `lot_id =`.

- [ ] **Step 1:** Close a packaging run (Program 5) so a lot exists; trace returns the batch id and production_in movement.

- [ ] **Step 2–5:** Commit `feat(compliance): lot trace follows run → occupancy → batch`

---

### Task 5: Pages, ungate, docs

Compliance registry, months, file month, lot trace. Nav Compliance. Ungate registry/file/generate/trace. Leave Monthly compliance `reattribute_loss` / `get_loss_review` SCHEMA-GATE. Staff-guide: MGR does not transmit; zeros print 0.00. Browse generate → file.

Commit `docs: compliance registry and filings live`

---

## Validation

```bash
bunx vitest run tests/compliance.test.ts tests/rls-command-boundary.test.ts tests/sale-channels.test.ts
bunx tsc --noEmit && bun run lint
```

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Recomputing a filed month from live channels | High | Snapshot jsonb; test that channel edit does not change `report_filings.figures` |
| Building a `v_bro` view | Medium | Generator is a function; no view |
| Shipping loss reattribution because the month screen mentions it | High | Keep SCHEMA-GATE |

## Acceptance

- [ ] COLA is on a brand
- [ ] File refuses an unbalanced generate
- [ ] Filed figures are immutable
- [ ] Loss review still gated
