# Program 10 — Explorer parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every **ungated** MGR screen record has a live route that uses `E.*` and the same fields/verbs as the explorer. A vitest fails if the inventory promises a page the app does not have.

**Architecture:** No new SCHEMA-GATE tables except `invoice_questions` (small, not an iron-rule gate). Landings are queries over data Programs 1–9 already write. Search is one registered query. Team role/revoke are single-row RPCs; invite stays gated.

**Tech Stack:** Same as Program 1. New `tests/app-screen-parity.test.ts`.

**Spec:** Remainder index `.agents/superpowers/plans/2026-09-07-backend-explorer-remainder.md` bucket B. Screen records named there. Parent unification plan D3A.

## Global Constraints

- Worktree `.agents/worktrees/backend`. The parity **test** can land as soon as Program 0 exists (it will be red). The **pages** land after the program that owns their commands (Orders after 1, Beer landing after 5–7, etc.).
- Screens stay fixtures. Live pages must not import `SCREENS` bodies.
- `invite_staff`, `import_csv`, `provision_brewery`, tap board, QBO pay, composer stay gated — the parity test **excludes** SCHEMA-GATE, IMPLEMENTATION-GATE, and `venue` records.
- TDD, docs:api, staff/portal guides, no Co-Authored-By.

## File map

| File | Responsibility |
| --- | --- |
| `tests/app-screen-parity.test.ts` | ungated MGR screen name → live route |
| `lib/mgr/screen-routes.ts` | the map the test and nav share |
| `lib/commands/search.ts` | `search_entities` |
| `lib/commands/catalog.ts` | `update_brewery`, `update_staff_role`, `revoke_staff` |
| `lib/commands/portal.ts` | already has account; invoice questions staff side in `orders.ts` |
| `app/(app)/page.tsx` and landings | Beer, Work, More |
| `app/(app)/settings/` | Settings, Team rewrite |
| `components/mgr/me-sheet.tsx` | Me record |
| `app/(app)/not-found.tsx` / permission | Permission denied record |
| `supabase/migrations/00001_baseline.sql` | `invoice_questions` + RPCs |

---

### Task 1: Parity test (red, then keep it red until routes exist)

**Files:**
- Create: `lib/mgr/screen-routes.ts`, `tests/app-screen-parity.test.ts`

**Interfaces:**
- Produces:

```ts
export const SCREEN_ROUTES: Record<string, string>
export function ungatedMgrScreens(): { name: string }[]
```

`ungatedMgrScreens` walks `SCREENS` and drops `venue`, and drops a screen if every write/read token is SCHEMA-GATE or IMPLEMENTATION-GATE **and** the body is only a gated verb (Weekly count stays out until Program 12). A screen with mixed available+gated writes (Team) **is in** the set.

- [ ] **Step 1:**

```ts
import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SCREENS } from "@/components/mgr/screens";
import { SCREEN_ROUTES, ungatedMgrScreens } from "@/lib/mgr/screen-routes";

function pageFiles(dir = "app"): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...pageFiles(p));
    else if (ent.name === "page.tsx") out.push(p);
  }
  return out;
}

describe("explorer parity", () => {
  it("every ungated MGR screen names a live route that exists", () => {
    const pages = pageFiles();
    const missing: string[] = [];
    for (const s of ungatedMgrScreens()) {
      const route = SCREEN_ROUTES[s.name];
      if (!route) { missing.push(`${s.name}: no SCREEN_ROUTES entry`); continue; }
      const file = join("app", route.replace(/^\//, "").replace(/\[id\]/g, "[id]"), "page.tsx")
        .replace("app/page.tsx", "app/(app)/page.tsx"); // see map comments
      // simpler: SCREEN_ROUTES values are paths under app/ that must exist
    }
    expect(missing, "add a live page or keep the screen gated").toEqual([]);
  });
});
```

Implement `SCREEN_ROUTES` as `{ name: string, file: string }[]` pointing at real files:

```ts
export const SCREEN_ROUTES: { name: string; file: string }[] = [
  { name: "Today", file: "app/(app)/page.tsx" },
  { name: "Orders", file: "app/(app)/orders/page.tsx" },
  { name: "Search", file: "app/(app)/search/page.tsx" }, // Task 3
  // …every ungated name
];
```

The test: for each `ungatedMgrScreens()` name, an entry exists and `existsSync(file)`.

- [ ] **Step 2:** Run `bunx vitest run tests/app-screen-parity.test.ts` — FAIL listing missing files. **Commit this failing test** with `[no-tests]` **not** used — the test file is the test. Empty `SCREEN_ROUTES` plus the assertion is enough to go red.

Wait: CI TDD gate requires tests with lib/ changes. Landing only a test is fine.

- [ ] **Step 3:** Fill `SCREEN_ROUTES` for pages that already exist (orders, catalog, portal, …). Leave missing names without entries so the test stays red. Each later task adds its row and the missing list shrinks.

- [ ] **Step 4:** Commit `test: ungated explorer screens must have a live page`

---

### Task 2: Landings — Beer, Work, More

**Files:** `app/(app)/beer/page.tsx`, `app/(app)/work/page.tsx`, `app/(app)/more/page.tsx` OR keep tabs as Today/inventory/orders/invoices and make those pages draw the landing records. Nav today: Beer href `/inventory` — **change** Beer href to a landing at `/beer` that links to inventory, cellar, materials, kegs, taps (taps gated). Work href `/work` listing due work (query `list_work` = union of get_today + open POs + open routes, role filtered). More stays the rail; the phone More tab should render the More record (nav list), not jump to Invoices.

**Interfaces:**
- `list_work({ kinds?: string[] })` query — rows `{ label, detail, href, verb, dueAt, kind }`. Kind chips remembered in `localStorage` key `mgr-work-filter` (client). Default kinds from role (warehouse: orders, restock, POs, routes).
- `get_beer_overview` query — counts: FG shortages, taproom below par, open taps (0 until Program 12), open occupancies, material shortages, kegs out. Each is a nav row.

- [ ] **Step 1:** Tests in `tests/commands-today.test.ts` or `tests/landings.test.ts`: warehouse `list_work` includes a submitted order; brewer does not see POs. `get_beer_overview` returns numeric fields (zeros allowed).

- [ ] **Step 2–5:** Implement queries + pages using `E.hd` / `E.nav` / `E.row` matching the records. Update `STAFF_NAV` hrefs: Beer → `/beer`, Work → `/work`, More → `/more`. `tests/nav-ready-links.test.ts` must pass. Add SCREEN_ROUTES rows. Commit `feat(shell): Beer, Work, and More landings`

---

### Task 3: `search_entities` and Entity picker

**Files:** `lib/commands/search.ts`, `all.ts`, `app/(app)/search/page.tsx` (sheet via CommandForm or a header-opened sheet)

**Interfaces:**
- `search_entities({ q: string, kinds?: ("sku"|"order"|"lot"|"customer"|"po"|"batch")[] }) => { kind, id, label, detail, href }[]`
- Document-number prefix (`ORD-`, `INV-`, `PO-`, `L-`) exact match sorts first. Name match is `ilike q%`. RLS decides rows. Limit 25.

- [ ] **Step 1:** Seed an order ORD-0001 and SKU "Hazy"; search `"ORD-0001"` returns the order first; search `"Haz"` returns the SKU; a customer role calling it is 403.

- [ ] **Step 2–5:** One SQL function `search_entities(p_brewery, p_q, p_kinds text[])` security definer that still filters `is_staff_of`. Wire header Search to this sheet. Entity picker reuses it. Commit `feat(search): one registered search across permitted kinds`

---

### Task 4: Me, Settings, `update_brewery`, Permission denied

**Files:** `components/mgr/me-sheet.tsx`, `app/(app)/settings/page.tsx`, baseline `update_brewery`, `lib/commands/catalog.ts`, permission page

**Interfaces:**
- `update_brewery({ name, timezone, ttbRegistryNo?, paLicenseNo?, customerPhone? })` admin. Phone lives in `breweries.settings->>'customer_phone'` until a typed column is justified — **prefer a typed `customer_phone text` column** (portal already needs it). Add the column.
- Me: show email (from session, not brewery_users), role, brewery switcher only if `memberships.length > 1`, Change password, Sign out destructive.
- Permission denied: when `CommandError` code `permission_denied` on a page load, render the Permission denied record (what was refused, signed-in-as, needs role). Reuse `app/(app)/error.tsx` or a dedicated `unauthorized.tsx`.

- [ ] **Step 1:** `update_brewery` as admin succeeds; sales 403. Permission page test can be a pure render skip — logic: a helper `deniedCopy({ resource, role, needs })` unit-tested.

- [ ] **Step 2–5:** Commit `feat(settings): update_brewery, Me, and permission denied`

---

### Task 5: Team role change and revoke (invite stays gated)

**Files:** baseline RPCs, `lib/commands/catalog.ts` or `settings.ts`, `app/(app)/settings/team/`

**Interfaces:**
- `update_staff_role({ userId, role })` admin. Refuse if it would leave zero admins. Refuse `taproom` until Program 12 says otherwise (zod enum remains admin/sales/warehouse/brewer).
- `revoke_staff({ userId })` admin. Ends `brewery_users` row only. Refuse self. Refuse last admin. Auth user remains.
- Live Team page: `@` + local-part if we store nothing — **emails are not in brewery_users**. Options: (a) show user_id still, or (b) a definer RPC `list_team_members` that reads `auth.users.email` via `auth.users` as owner. **(b) is required to match the screen.** `list_team_members` becomes an RPC returning `{ userId, email, role, display }` where display is `@` + local part. Pending invites: empty until Program 11.

- [ ] **Step 1:** Two admins, revoke one succeeds; revoke last admin raises; update own role to sales when you are the only admin raises; sales cannot revoke.

- [ ] **Step 2–5:** Rewrite Team page to the record (gated Invite staff). Commit `feat(team): change role and revoke membership; invite still gated`

---

### Task 6: First-run checklist (skip gated steps)

**Files:** `lib/commands/today.ts` or `settings.ts` query `get_first_run_state`, `app/(app)/page.tsx`

**Interfaces:**
- `get_first_run_state => { hasLocation, hasBrand, hasMovement, hasStaff besides owner }`
- Today page: if admin and `!hasLocation && !hasBrand`, render First-run checklist instead of Today rows. Invite and Import rows are gated/skip. Add location and add brand and record movement use existing commands.

- [ ] **Step 1:** New brewery, `get_first_run_state` all false; after `create_location` hasLocation true.

- [ ] **Step 2–5:** Commit `feat(today): first-run checklist until locations and a brand exist`

---

### Task 7: Rewrite remaining Slice-1 pages to their records

**Files:** every `app/(app)/orders`, `customers`, `invoices`, `inventory`, `catalog`, `pricing`, `pick`, `replenishment` page still using raw `<h1>` + `<table>` after Programs 1–9; portal shop/orders/invoices/account/Me.

**Interfaces:** none new. Each page: `E.hd` / `E.row` / `CommandForm` matching the named screen. Complete transfer is the taproom_transfer body of ship (already in Program 1). Pick sheet already at `/pick`.

- [ ] **Step 1:** Extend `tests/app-screen-parity.test.ts` so `file` exists **and** the file imports from `@/components/mgr/e` (string includes `'from "@/components/mgr/e"'` or `'from "@/components/mgr/command-form"'`). Existing Slice-1 pages will fail until rewritten.

- [ ] **Step 2:** FAIL on inventory/orders/customers/invoices/catalog/portal.

- [ ] **Step 3:** Rewrite each. Do not import SCREENS.

- [ ] **Step 4:** Parity test green for bucket B names.

- [ ] **Step 5:** Commit `ui: live pages use the explorer E vocabulary`

---

### Task 8: Invoice questions

**Files:** baseline table, `lib/commands/orders.ts` + `portal.ts`

**Interfaces:**
- Table `invoice_questions (id, brewery_id, invoice_id, customer_id, body text, created_by, created_at, answered_at, answered_by)`
- `raise_invoice_question({ invoiceId, body })` customer; derives customer from ctx
- `list_invoice_questions` sales/admin — unanswered first
- `resolve_invoice_question({ questionId })` sales/admin sets `answered_at`
- Sales Today: include `invoice_question` in `today_live_reasons` when Program 1 Today is live — add union arm `invoice_question` with href `/invoices/:id`

- [ ] **Step 1:** Portal customer raises; sales Today lists it; resolve clears it; another customer cannot see it.

- [ ] **Step 2–5:** Commit `feat(invoices): portal questions land on sales Today`

---

### Task 9: Docs, ungate, browse

Ungate Team writes except invite and taproom role. Ungate Search, Settings, First-run (except invite/import). Question invoice. `bun run docs:api`. Browse landings, search, team, first-run, orders list vs explorer.

Commit `docs: explorer parity for ungated MGR chrome`

---

## Validation

```bash
bunx vitest run tests/app-screen-parity.test.ts tests/landings.test.ts tests/commands-catalog.test.ts tests/commands-portal.test.ts tests/nav-ready-links.test.ts tests/screen-command-gates.test.ts
bunx tsc --noEmit && bun run lint
```

## Acceptance

- [ ] `ungatedMgrScreens()` has a live `E.*` page
- [ ] Invite / Import / Create brewery / tap board / composer / QBO pay still gated
- [ ] Team shows @handle, not raw user ids
