# Price Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one price group own a format's price, its barcode, and the cost
ceiling that suggests it, and retire the word "tier" from the product.

**Architecture:** Screens-only, per the current focus. Every new field is drawn
behind the `SCHEMA-GATE` tag its neighbours already carry; no migration, no RPC,
no database work. The single piece of real logic — resolving a SKU's barcode
through its brand's group — lands as a pure function in `lib/mgr/` with its own
vitest, matching how `lib/mgr/screen-links.ts` keeps the explorer's resolver
testable without a DOM.

**Tech Stack:** Next.js App Router, React 19 (static `renderToStaticMarkup` in
tests), TypeScript, vitest, Fumadocs MDX for the customer guides, bun.

**Spec:** `.agents/superpowers/specs/2026-09-07-mgr-price-groups.md`

## Global Constraints

- **Branch and worktree.** Work in `.agents/worktrees/price-groups` on branch
  `price-groups`, based on `origin/backend`. Verify with `git branch
  --show-current` before the first edit and again before each commit; a
  parallel session owns `backend` and has unpushed commits, so never edit
  outside this worktree.
- **Proof command** for every task (the current focus's stand-in for `bun run
  test`, which needs a database):

      bunx vitest run tests/mgr-screens.test.ts tests/screen-links.test.ts \
        tests/screen-command-gates.test.ts tests/tap-coverage.test.ts \
        tests/theme-contrast.test.ts tests/screen-persona.test.ts \
        tests/design-docs.test.ts tests/docs.test.ts tests/nav-ready-links.test.ts
      bunx tsc --noEmit && bun run lint

  A fresh worktree has an empty `node_modules` and no env file. Before the
  first run: `bun install --frozen-lockfile` and `cp
  /Users/tedslesinski/Repos/mgr-zero/.env.local .env.local` (three suites read
  `NEXT_PUBLIC_SUPABASE_URL` at import). Do not commit `.env.local`.
- **The word "tier" is retired** (spec D8). After Task 1, `tier` must not
  appear in `components/mgr/screens.tsx`, `lib/mgr/nav.ts`,
  `lib/mgr/screen-links.ts`, or `content/docs/staff-guide.mdx`. Registered
  command names (`list_price_lists`, `set_price_list_format`,
  `set_price_list_item`, `clear_price_list_item`, `upsert_price_list`,
  `get_price_list`) keep their names — they are the shipped registry, and
  renaming them is backend work this plan does not do.
- **Every new field is gated.** Use the exact tag
  `[SCHEMA-GATE: revision 2 §16.4]` for price-group columns, matching the
  existing tag on the same screen. `tests/screen-command-gates.test.ts` fails
  on an untagged write naming an unregistered command.
- **Empty UPC is quiet, empty price is loud** (spec D4). A blank UPC cell
  renders as an em dash with no warning tone; never add a `no barcode` entry to
  a screen's `states`.

---

### Task 1: Retire "tier" — rename the two screens and every reference

**Files:**
- Modify: `components/mgr/screens.tsx` (lines 273, 281, 1303, 1514, 3296–3341)
- Modify: `lib/mgr/nav.ts:70`
- Modify: `lib/mgr/screen-links.ts:39,136,137,312`
- Modify: `content/docs/staff-guide.mdx:48`
- Test: `tests/mgr-screens.test.ts:122,134,229,630`, `tests/nav-ready-links.test.ts:47`

**Interfaces:**
- Consumes: nothing.
- Produces: the screen names `"Price groups"` (the list) and `"Price group"`
  (the detail). Tasks 2, 3 and 5 look screens up by these exact strings.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`, inside the top-level `describe("SCREENS")`:

```ts
it("names the pricing surfaces price groups, never tiers", () => {
    expect(SCREENS.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Price groups", "Price group"]));
    expect(SCREENS.map((s) => s.name)).not.toEqual(
      expect.arrayContaining(["Price lists", "Price tiers"]));
    const drawn = SCREENS.map((s) =>
      renderToStaticMarkup(createElement("div", null, s.body))).join(" ");
    expect(drawn).not.toMatch(/\btiers?\b/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "price groups, never tiers"`
Expected: FAIL — the array contains `"Price lists"` and `"Price tiers"`, and
the drawn markup still contains "Wholesale tier".

- [ ] **Step 3: Rename the screens**

In `components/mgr/screens.tsx`, replace the `Price lists` record's fields:

```tsx
    name: "Price groups",
    to: { Taproom: "Price group" },
    job: "See customer price groups and open the prices each group owns",
    reads: "list_price_lists",
    writes: "none [creation and pricing happen on Price group]",
    states: [["unused", "a group with no customers can still be edited"], ["empty", "no price groups yet: Create price group is the only action"]],
    spec: "Reached from Catalog. Each row names its next action and opens Price group; Create price group opens the same surface for a new group.",
    body: (<>
      {E.back("Catalog", "Price groups", E.btn("Create price group"))}
      {E.row("Wholesale · standard", "18 customers · 12 priced formats", E.act("Edit prices"))}
      {E.row("Wholesale · distributor", "3 customers · 12 priced formats", E.act("Edit prices"))}
      {E.row("Taproom", "no customers · 8 priced formats", E.act("Edit prices"))}
    </>),
```

Then the `Price tiers` record:

```tsx
    name: "Price group",
    to: { Edit: "Override", Add: "Override" },
    job: "Price a format once per group and override only the exceptions",
```

and inside its `body`, the first two lines:

```tsx
      {E.back("Price groups", "Wholesale · standard")}
      {E.edit("Group name", "Wholesale · standard")}
```

and its trailing info line:

```tsx
      {E.info(`All halves are ${INV.hazyPrice}, except the barrel-aged one. Clear an override and the row rejoins the group.`)}
```

Rewrite the same record's `states` and `spec`, replacing every "tier" with
"group":

```tsx
    states: [["permission", "sales or admin required", 1], ["inherited", "the format price is what the customer sees"], ["overridden", "one brand × format priced away from the group", 1], ["poured", "a pour is priceable here and is not a SKU"], ["no price", "neither a format default nor an override · the line cannot be sold", 1]],
    spec: "Price lists are already groups and the customer's assigned price list already assigns them; revision 2 adds the channel and makes a format priceable, so a taproom pour (which is not a SKU) can be priced at all. Drawn format-default with a per-SKU override, matching Menu and POS item, which already read “format default” and offer Reset to format price. §16.16 q1 leaves the direction open; drawing it the other way would make those two shipped frames inconsistent.",
```

In the same record's `tbl`, the Source column values become `"group default"`
in all three rows.

- [ ] **Step 4: Fix the remaining references**

`components/mgr/screens.tsx:273` and `:281` (the **More** landing). The `to`
entry existed only because the label ("Price tiers") differed from the screen
it opened ("Price lists"); after the rename they match, and `resolveTap` falls
through to its exact-screen-name tier. Delete the entry rather than writing an
identity mapping:

Delete line 273 entirely — `"Price tiers": "Price lists"` is that record's
only `to` entry, and `to` is optional on `Screen`. Then line 281:

```tsx
      {E.nav("Price groups", "customer price groups")}
```

`components/mgr/screens.tsx:1303` (the customer sheet's picker) and `:1514`:

```tsx
      {E.pick("Price group", "Wholesale · standard", ["Wholesale · standard", "Wholesale · distributor", "Taproom"])}
```
```tsx
      {E.nav("Price groups", "3 groups")}
```

`components/mgr/screens.tsx:3341` (the Override sheet):

```tsx
    to: { "Save override": "Price group", "Clear override": "Price group" },
    job: "Price one brand and format away from its group default",
```
and its `states` third entry becomes `["cleared", "format default applies"]`
(unchanged) while the second stays as drawn.

`lib/mgr/nav.ts:70`:

```ts
      { label: "Price groups", href: "/pricing", roles: ["sales"] },
```

`lib/mgr/screen-links.ts` lines 39, 136, 137, 312:

```ts
  ["Edit prices", "Price group"],
```
```ts
  ["Create price group", "Price group"],
  [/^Wholesale · /, "Price group"],
```
```ts
  "/pricing": "Price groups",
```

- [ ] **Step 5: Update the existing tests to the new names**

`tests/mgr-screens.test.ts` lines 122, 134: replace `"Price tiers"` with
`"Price group"`. Line 229: `SCREENS.find((s) => s.name === "Price group")!`.
Line 630: `["Price groups", "Create price group"]`.
`tests/nav-ready-links.test.ts:47`: `"Price groups"` in the expected array.

- [ ] **Step 6: Update the customer guide**

`content/docs/staff-guide.mdx:48` — in the sentence listing the More tab,
change `**Invoices, Catalog, Customers, Price lists**` to
`**Invoices, Catalog, Customers, Price groups**`.

- [ ] **Step 7: Regenerate the API reference**

Run: `bun run docs:api`
This rewrites the screen names in `content/docs/api.mdx` (four rows referencing
`Price tiers`). Confirm with `git diff content/docs/api.mdx` that only those
rows changed.

- [ ] **Step 8: Run the proof**

Run the Global Constraints proof command.
Expected: PASS, all suites.

- [ ] **Step 9: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/nav.ts lib/mgr/screen-links.ts \
  content/docs/staff-guide.mdx content/docs/api.mdx tests/mgr-screens.test.ts \
  tests/nav-ready-links.test.ts
git commit -m "ui: price groups, not tiers

A distributor calls the product type a tier, v1 called a COGS band a tier, and
these screens called a customer price list a tier. Three live meanings make the
word unusable, so the concept is a price group everywhere a person reads it.
Registered command names keep price_list; they are the shipped registry."
```

---

### Task 2: The cost ceiling that suggests a group

**Files:**
- Modify: `components/mgr/screens.tsx` (the `Price group` record from Task 1)
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the screen named `"Price group"` (Task 1).
- Produces: nothing other tasks read.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("gives a price group a cost ceiling that only suggests", () => {
    const group = SCREENS.find((s) => s.name === "Price group")!;
    const text = renderToStaticMarkup(createElement("div", null, group.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Cost ceiling");
    expect(text).toMatch(/suggest/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "cost ceiling"`
Expected: FAIL — "Cost ceiling" is not in the markup.

- [ ] **Step 3: Draw the field**

In the `Price group` record's `body`, immediately after the `Channel` picker:

```tsx
      {E.edit("Cost ceiling", "$1.85", "text")}
      {E.info("Groups sort by ceiling and the lower bound is the previous group's. A cost inside this band suggests the group; nobody is moved automatically.")}
```

- [ ] **Step 4: Record the states**

Add two entries to the same record's `states` array, after the `no price` entry:

```tsx
["no ceiling", "the group is chosen by hand · nothing is suggested"], ["suggested", "a cost inside the band proposes this group · a person confirms", 0]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "cost ceiling"`
Expected: PASS

- [ ] **Step 6: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/mgr/screens.tsx tests/mgr-screens.test.ts
git commit -m "ui: a price group carries the cost ceiling that suggests it

Groups sort by ceiling; the lower bound is the previous group's. The band
proposes and a person confirms, because costing is not built and an automatic
move would be a price change nobody asked for."
```

---

### Task 3: The barcode column, quiet where a price would shout

**Files:**
- Modify: `components/mgr/screens.tsx` (the `Price group` record)
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the screen named `"Price group"` (Task 1).
- Produces: the Format defaults table's four-column shape
  `["Format", "Price", "UPC", "Source"]`, which Task 5's test reads as the
  source of truth for which formats carry a code.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("barcodes a price group per format, and stays quiet when there is none", () => {
    const group = SCREENS.find((s) => s.name === "Price group")!;
    const text = renderToStaticMarkup(createElement("div", null, group.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("UPC");
    expect(text).toContain("00810123450127");
    // A keg has no retail code and that is permanent, not incomplete setup.
    expect(text).toContain("—");
    expect((group.states ?? []).map(([name]) => name)).not.toContain("no barcode");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "barcodes a price group"`
Expected: FAIL — "UPC" is not in the markup.

- [ ] **Step 3: Add the column**

Replace the `Format defaults` table in the `Price group` record:

```tsx
      {E.tbl(["Format", "Price", "UPC", "Source"], [["½ bbl keg", INV.hazyPrice, "—", "group default"], ["sixtel", "$95.00", "—", "group default"], ["case · 24×16oz", INV.pilsPrice, "00810123450127", "group default"]])}
      {E.info("Every brand in this group scans as the group's code for that format. Kegs carry no retail code: they move on lot numbers, so a blank UPC is finished, not unfinished.")}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "barcodes a price group"`
Expected: PASS

- [ ] **Step 5: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/mgr/screens.tsx tests/mgr-screens.test.ts
git commit -m "ui: a price group barcodes per format

Price already varies by format in this table, so the barcode does too; a
12 oz and a 16 oz can are already two Formats and get two codes by
construction. An empty UPC is a legitimate permanent state where an empty price
blocks a sale, so it renders as an em dash and earns no states entry."
```

---

### Task 4: The barcode resolver

**Files:**
- Create: `lib/mgr/price-group-barcode.ts`
- Create: `tests/price-group-barcode.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure, no import of `screens.tsx`).
- Produces:

  ```ts
  export type PriceGroupFormat = { format: string; upc: string | null };
  export type PriceGroup = { name: string; formats: PriceGroupFormat[] };
  export type BarcodeLookup = {
    brandGroup: (brand: string) => string | undefined;
    group: (name: string) => PriceGroup | undefined;
  };
  export function resolveBarcode(
    lookup: BarcodeLookup, brand: string, format: string,
  ): string | null;
  ```

  Task 5 imports `resolveBarcode` only to assert the SKU screen's drawn code
  agrees with it.

- [ ] **Step 1: Write the failing test**

Create `tests/price-group-barcode.test.ts`:

```ts
// tests/price-group-barcode.test.ts — a SKU's barcode is not stored on the
// SKU. It resolves brand -> price group -> (group x format) UPC, with no
// override at any hop, so every brand in a group scans alike. Pure, so this
// walks the chain without a DOM or a database.
import { describe, expect, it } from "vitest";
import { resolveBarcode, type BarcodeLookup } from "../lib/mgr/price-group-barcode";

const lookup: BarcodeLookup = {
  brandGroup: (brand) =>
    ({ "Hazy IPA": "Standard", Pils: "Standard", "Barrel-aged Stout": "Specialty" })[brand],
  group: (name) =>
    ({
      Standard: { name: "Standard", formats: [
        { format: "case · 24×16oz", upc: "00810123450127" },
        { format: "½ bbl keg", upc: null },
      ] },
      Specialty: { name: "Specialty", formats: [
        { format: "case · 24×16oz", upc: "00810123450134" },
      ] },
    })[name],
};

describe("resolveBarcode", () => {
  it("gives every brand in a group the same code for a format", () => {
    expect(resolveBarcode(lookup, "Hazy IPA", "case · 24×16oz")).toBe("00810123450127");
    expect(resolveBarcode(lookup, "Pils", "case · 24×16oz")).toBe("00810123450127");
  });

  it("separates groups", () => {
    expect(resolveBarcode(lookup, "Barrel-aged Stout", "case · 24×16oz")).toBe("00810123450134");
  });

  it("returns null rather than throwing at every missing hop", () => {
    expect(resolveBarcode(lookup, "Hazy IPA", "½ bbl keg")).toBeNull();
    expect(resolveBarcode(lookup, "Hazy IPA", "sixtel")).toBeNull();
    expect(resolveBarcode(lookup, "Guest cider", "case · 24×16oz")).toBeNull();
    expect(resolveBarcode(lookup, "Barrel-aged Stout", "½ bbl keg")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/price-group-barcode.test.ts`
Expected: FAIL — cannot resolve `../lib/mgr/price-group-barcode`.

- [ ] **Step 3: Write the implementation**

Create `lib/mgr/price-group-barcode.ts`:

```ts
// lib/mgr/price-group-barcode.ts — a SKU's barcode is not stored on the SKU.
// It resolves brand -> price group -> (group x format) UPC, with no override
// at any hop, which is what makes a rotating series ring up identically at a
// retailer. Every hop is allowed to be missing: a brand with no group, a
// format the group never priced, and a format that legitimately carries no
// retail code (a keg moves on lot numbers) all answer null rather than throw.
// Pure and lookup-injected, so tests/price-group-barcode.test.ts walks the
// chain without a database, matching lib/mgr/screen-links.ts.

/** One format's price-group facts. `upc` is null when the format has no retail code. */
export type PriceGroupFormat = { format: string; upc: string | null };

export type PriceGroup = { name: string; formats: PriceGroupFormat[] };

/** The two reads the chain needs, injected so the resolver stays pure. */
export type BarcodeLookup = {
  brandGroup: (brand: string) => string | undefined;
  group: (name: string) => PriceGroup | undefined;
};

/** The barcode a brand's SKU scans as in one format, or null if it has none. */
export function resolveBarcode(
  lookup: BarcodeLookup,
  brand: string,
  format: string,
): string | null {
  const groupName = lookup.brandGroup(brand);
  if (!groupName) return null;
  const group = lookup.group(groupName);
  if (!group) return null;
  return group.formats.find((f) => f.format === format)?.upc ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/price-group-barcode.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the proof**

Run the Global Constraints proof command, adding
`tests/price-group-barcode.test.ts` to the file list. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/mgr/price-group-barcode.ts tests/price-group-barcode.test.ts
git commit -m "feat(mgr): resolve a SKU's barcode through its brand's price group

The chain is brand -> group -> (group x format) UPC with no override at any
hop, which is the whole point: a rotating series scans identically and the
retailer never re-keys. Every hop may be missing and answers null, because a
keg carrying no retail code is a permanent correct state."
```

---

### Task 5: The SKU reads its code, and its spec stops claiming to own one

**Files:**
- Modify: `components/mgr/screens.tsx:1573` (the `SKU` record's `spec` and `body`)
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: `resolveBarcode` (Task 4), the `Price group` table shape (Task 3).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("shows a SKU the barcode its group resolves, and never claims to own one", () => {
    const sku = SCREENS.find((s) => s.name === "SKU")!;
    expect(sku.spec).not.toMatch(/UPC\/provider mappings/);
    expect(sku.spec).toMatch(/price group/i);
    const text = renderToStaticMarkup(createElement("div", null, sku.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Barcode");
    expect(text).toContain("00810123450127");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "never claims to own one"`
Expected: FAIL — the spec still contains "UPC/provider mappings".

- [ ] **Step 3: Correct the spec sentence**

Replace the `SKU` record's `spec`:

```tsx
    spec: "A SKU owns the stable sellable identity, active state, provider mappings and any price exception. Its barcode is not its own: it resolves through the brand's price group for this format (lib/mgr/price-group-barcode.ts), so every brand in a group scans alike and there is no SKU override to drift. Its name, volume and packaging derive from the selected Format. There are no SKU packaging overrides: a different volume or BOM is a different Format.",
```

- [ ] **Step 4: Draw the read-only barcode**

In the `SKU` record's `body`, after the `Active` row and before the `info`:

```tsx
      {E.fld("Barcode", "00810123450127 · Standard group")}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "never claims to own one"`
Expected: PASS

- [ ] **Step 6: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/mgr/screens.tsx tests/mgr-screens.test.ts
git commit -m "ui: a SKU reads its barcode, it does not own one

The spec sentence claimed the SKU owned UPC and provider mappings while the
body drew no UPC control at all. It keeps provider mappings and price
exceptions; the barcode resolves through the brand's price group, shown
read-only so the one source is legible where people look for it."
```

---

### Task 6: The recipe parent's optional default

**Files:**
- Modify: `components/mgr/screens.tsx` (the `Recipe` record)
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the `Price group` screen name (Task 1).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("lets a recipe parent suggest a price group without pricing a version", () => {
    const recipe = SCREENS.find((s) => s.name === "Recipe")!;
    const text = renderToStaticMarkup(createElement("div", null, recipe.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Default price group");
    expect(text).toMatch(/pre-fill|prefill/i);
    // A version is a process spec: no price, no group, ever.
    expect(recipe.writes).not.toMatch(/price/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "suggest a price group"`
Expected: FAIL — "Default price group" is not in the markup.

- [ ] **Step 3: Draw the field**

In the `Recipe` record's `body`, directly after the
`E.row("Recipe parent · Hazy IPA · IPA", …)` line:

```tsx
      {E.pick("Default price group · optional", "Standard", ["Not decided", "Standard", "Specialty", "Barrel-aged"])}
      {E.info("A pre-fill for the brand a batch packages into, nothing more. The version carries no price and no group; changing this cuts no new version.")}
```

- [ ] **Step 4: Record the state**

Add to the `Recipe` record's `states` array — note it is built by
`permitted("brewer or admin required")`, so change that line to:

```tsx
    states: [...permitted("brewer or admin required"), ["no group yet", "the brand picks one at packaging · nothing is blocked"]],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "suggest a price group"`
Expected: PASS

- [ ] **Step 6: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/mgr/screens.tsx tests/mgr-screens.test.ts
git commit -m "ui: a recipe parent may suggest a price group

On the parent, never the version: a version is a process spec, and hanging a
group off it would cut a new immutable version every time a band changed. It
commits nothing, so it may dangle; the brand is where the group binds."
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
| --- | --- |
| D1 rename to price group | 1 |
| D2 group owns the barcode, no SKU override | 4, 5 |
| D3 barcode per group × format, nullable | 3, 4 |
| D4 empty UPC quiet, empty price loud | 3 |
| D5 binds on the brand | already drawn (`screens.tsx:1553`); asserted indirectly by 4 |
| D6 nothing on the recipe version | 6 |
| D7 bands suggest, humans confirm | 2 |
| D8 "tier" retired | 1 |
| D9 band is its own axis | no task — it is a decision about what *not* to build; Task 1's test forbids "tier", and Style and Category are already drawn |
| Resolution chain | 4 |
| Prior art / §16.4 mapping | no task — schema work, explicitly out of scope |

**Placeholder scan:** none. Every code step carries the literal text to write.

**Type consistency:** `resolveBarcode`, `BarcodeLookup`, `PriceGroup` and
`PriceGroupFormat` are defined in Task 4 and referenced only there and in Task
5's prose. Screen names `"Price groups"` / `"Price group"` are used
consistently from Task 1 onward.

**Known gap, deliberate:** the `Brand` screen's `reads` still names
`list_brands` / `list_skus` while the registry has `list_products`. The gate
test only checks `writes`, so this passes today. It is Program 3's rename, not
this plan's.
