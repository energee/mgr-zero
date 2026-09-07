# Recipe Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a recipe version something a brewer can brew from — volumes, boil
and whirlpool, a mash schedule, a fermentation schedule, water profiles with
salt additions, and structured ingredient timing.

**Architecture:** Screens-only, per the current focus. Five new screens and two
modified ones in `components/mgr/screens.tsx`, each new field behind
`SCHEMA-GATE`. Repetition earns a surface, so the two step schedules and water
get their own screens; single-occurrence scalars stay inline on Recipe. One pure
helper in `lib/mgr/` carries the only logic.

**Tech Stack:** Next.js App Router, React 19 (`renderToStaticMarkup` in tests),
TypeScript, vitest, bun.

**Spec:** `.agents/superpowers/specs/2026-09-07-mgr-recipe-builder.md`

## Global Constraints

- **Branch and worktree.** Work in `.agents/worktrees/recipe-builder` on branch
  `recipe-builder`, based on `origin/backend`. Run `git branch --show-current`
  before the first edit and again before each commit — a parallel session owns
  `backend` and pushes to it.
- **Setup, once.** A fresh worktree has empty `node_modules` and no env file:

      bun install --frozen-lockfile
      cp /Users/tedslesinski/Repos/mgr-zero/.env.local .env.local

  Three suites read `NEXT_PUBLIC_SUPABASE_URL` at import and fail without it.
  Never commit `.env.local`.

- **Proof command** for every task:

      bunx vitest run tests/mgr-screens.test.ts tests/screen-links.test.ts \
        tests/screen-command-gates.test.ts tests/tap-coverage.test.ts \
        tests/theme-contrast.test.ts tests/screen-persona.test.ts \
        tests/design-docs.test.ts tests/docs.test.ts tests/recipe-schedule.test.ts
      bunx tsc --noEmit && bun run lint

- **Every new screen needs a link entry.** A screen nothing resolves to is an
  orphan and `tests/tap-coverage.test.ts` counts the miss. Each task that adds a
  screen adds its `lib/mgr/screen-links.ts` rule in the same commit.
- **Every new write is gated.** Use `[SCHEMA-GATE: recipe process spec]` on new
  writes; `tests/screen-command-gates.test.ts` fails on an untagged write naming
  an unregistered command.
- **No calculations.** Footer totals are sums over a drawn list. Ion deltas,
  salt contribution and pH prediction are out of scope; the `SO4:Cl` line is
  static example text.

---

### Task 1: The schedule helper

**Files:**
- Create: `lib/mgr/recipe-schedule.ts`
- Create: `tests/recipe-schedule.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

  ```ts
  export type Step = { name: string; kind: string; tempF: number; duration: number };
  export function totalDuration(steps: readonly Step[]): number;
  export function saccharificationRest(steps: readonly Step[]): Step | null;
  ```

  Task 2 quotes `totalDuration`'s output in the Mash schedule footer; Task 3
  quotes it in the Fermentation footer.

- [ ] **Step 1: Write the failing test**

Create `tests/recipe-schedule.test.ts`:

```ts
// tests/recipe-schedule.test.ts — the only logic in the recipe builder. A
// schedule's footer states its total, and the mash footer names the rest the
// prediction reads, because Recipe no longer carries a Mash temp scalar.
import { describe, expect, it } from "vitest";
import { saccharificationRest, totalDuration, type Step } from "../lib/mgr/recipe-schedule";

const mash: Step[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, duration: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, duration: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, duration: 10 },
];

describe("totalDuration", () => {
  it("sums a schedule and answers zero for an empty one", () => {
    expect(totalDuration(mash)).toBe(85);
    expect(totalDuration([])).toBe(0);
  });
});

describe("saccharificationRest", () => {
  it("picks the longest step in the conversion range", () => {
    expect(saccharificationRest(mash)?.name).toBe("Saccharification");
  });

  it("prefers duration over order when two steps are both in range", () => {
    const stepped: Step[] = [
      { name: "Beta", kind: "infusion", tempF: 145, duration: 20 },
      { name: "Alpha", kind: "infusion", tempF: 158, duration: 40 },
    ];
    expect(saccharificationRest(stepped)?.name).toBe("Alpha");
  });

  it("answers null when nothing rests in range", () => {
    expect(saccharificationRest([])).toBeNull();
    expect(saccharificationRest([{ name: "Mash-out", kind: "direct heat", tempF: 168, duration: 10 }]))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/recipe-schedule.test.ts`
Expected: FAIL — cannot resolve `../lib/mgr/recipe-schedule`.

- [ ] **Step 3: Write the implementation**

Create `lib/mgr/recipe-schedule.ts`:

```ts
// lib/mgr/recipe-schedule.ts — a recipe version's mash and fermentation
// schedules are ordered step lists, and their screens state a total in the
// footer. saccharificationRest names the step the prediction reads: Recipe no
// longer carries a Mash temp scalar (spec D4), so the schedule is the only
// place that number lives and the footer has to point at it. Pure, so
// tests/recipe-schedule.test.ts covers it without a DOM.

/** One step of either schedule. `duration` is minutes for mash, days for fermentation. */
export type Step = { name: string; kind: string; tempF: number; duration: number };

/** Conversion happens between these temperatures; outside them a step is not a rest. */
const SACC_RANGE_F = [144, 162] as const;

/** The schedule's total duration, in whatever unit its steps carry. */
export function totalDuration(steps: readonly Step[]): number {
  return steps.reduce((total, step) => total + step.duration, 0);
}

/**
 * The conversion rest the prediction reads: the longest step sitting in the
 * saccharification range. Longest rather than first, because a step mash rests
 * twice in range and the alpha rest is the one that sets fermentability.
 */
export function saccharificationRest(steps: readonly Step[]): Step | null {
  const inRange = steps.filter(
    (s) => s.tempF >= SACC_RANGE_F[0] && s.tempF <= SACC_RANGE_F[1],
  );
  if (inRange.length === 0) return null;
  return inRange.reduce((best, s) => (s.duration > best.duration ? s : best));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/recipe-schedule.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/mgr/recipe-schedule.ts tests/recipe-schedule.test.ts
git commit -m "feat(mgr): total a recipe schedule and name its conversion rest

Recipe drops its Mash temp scalar, so the schedule becomes the only place that
number lives and the footer has to point at it. The rest is the longest step in
range rather than the first, because a step mash rests twice and the alpha rest
sets fermentability."
```

---

### Task 2: Mash schedule screen

**Files:**
- Modify: `components/mgr/screens.tsx` (new record after `Recipe`, near line 2460)
- Modify: `lib/mgr/screen-links.ts`
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: `totalDuration`, `saccharificationRest` (Task 1).
- Produces: the screen name `"Mash schedule"`, which Task 4's Recipe link row
  and Task 7's Brew day row both resolve to.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("draws a mash schedule with its steps, total and conversion rest", () => {
    const mash = SCREENS.find((s) => s.name === "Mash schedule")!;
    const text = renderToStaticMarkup(createElement("div", null, mash.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Saccharification");
    expect(text).toContain("152 °F");
    expect(text).toContain("Total 85 min");
    expect(text).toMatch(/feeds the prediction/);
    expect(text).toContain("Add step");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "draws a mash schedule"`
Expected: FAIL — `SCREENS.find(...)` is undefined, so the test throws on `.body`.

- [ ] **Step 3: Add the screen record**

Insert into `components/mgr/screens.tsx` immediately after the `Recipe` record's
closing `},`:

```tsx
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Mash schedule",
    to: { "Add step": "Mash schedule" },
    job: "Order the rests a brewer actually holds on the day",
    reads: "get_recipe [design; the version's mash_schedule array]",
    writes: "create_recipe_version [design; the array is written with its version, never alone; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "steps add, reorder and delete"], ["frozen", "a cut version reads only · create the next version to change it", 1], ["empty", "no steps yet: Add step is the only action"]],
    spec: "Its own screen because it repeats: add, reorder and delete are verbs a scalar field never needs, and inlining them on Recipe would give that page a second primary. A version is immutable, so this surface is an editor on a draft and a read-out once cut — one whole-screen mode rather than a toggle threaded through a long page. The footer names the conversion rest because Recipe no longer carries a Mash temp scalar (lib/mgr/recipe-schedule.ts); without it the number the prediction reads would have no visible home.",
    body: (<>
      {E.back("Recipe", "Hazy IPA v4 · Mash schedule", E.btn("Add step"))}
      {E.row("Mash-in", "infusion · 104 °F · 15 min", E.act("Edit"))}
      {E.row("Saccharification", "infusion · 152 °F · 60 min", E.act("Edit"))}
      {E.row("Mash-out", "direct heat · 168 °F · 10 min", E.act("Edit"))}
      {E.info("Total 85 min · the 152 °F rest feeds the prediction.")}
    </>),
  },
```

- [ ] **Step 4: Add the link rules**

In `lib/mgr/screen-links.ts`, add to the `TAPS` array beside the other
label rules:

```ts
  [/^Mash schedule · /, "Mash schedule"],
  ["Add step", "Mash step"],
```

Note: `"Mash step"` is added in Step 5 below; adding the rule first would
orphan it, so both land in this task's single commit.

- [ ] **Step 5: Add the step editor sheet**

Insert directly after the `Mash schedule` record:

```tsx
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Mash step",
    to: { "Save step": "Mash schedule", "Delete step": "Mash schedule" },
    job: "One rest: what the brewer does, at what temperature, for how long",
    reads: "get_recipe [design]",
    writes: "create_recipe_version [design; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "Type and name both stay: they look redundant until a recipe has two infusion steps, where the type says what the brewer does and the name says which one it is. Position comes from list order, never a typed number.",
    body: (<>
      {E.edit("Step name", "Saccharification")}
      {E.pick("Type", "infusion", ["infusion", "decoction", "direct heat", "rest"])}
      {E.cols(
        E.edit("Temp °F", "152", "number"),
        E.edit("Duration min", "60", "number"),
      )}
      {E.edit("Notes · optional", "")}
      {E.btns([["Delete step", "g"], "Save step"])}
    </>),
  },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "draws a mash schedule"`
Expected: PASS

- [ ] **Step 7: Run the proof**

Run the Global Constraints proof command. Expected: PASS. If
`tests/tap-coverage.test.ts` reports a miss, the label in the drawing and the
rule in `screen-links.ts` disagree — fix the rule, not the drawing.

- [ ] **Step 8: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts tests/mgr-screens.test.ts
git commit -m "ui: a mash schedule a brewer can follow

Its own screen because it repeats: add, reorder and delete are verbs a scalar
never needs, and inlining them would give Recipe a second primary. The footer
names the conversion rest, since Recipe stops carrying a Mash temp scalar and
the number needs a visible home."
```

---

### Task 3: Fermentation schedule screen

**Files:**
- Modify: `components/mgr/screens.tsx` (after the `Mash step` record)
- Modify: `lib/mgr/screen-links.ts`
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: `totalDuration` (Task 1).
- Produces: the screen name `"Fermentation schedule"`, resolved by Task 4's
  Recipe link row.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("draws a fermentation schedule that places the dry hop", () => {
    const ferm = SCREENS.find((s) => s.name === "Fermentation schedule")!;
    const text = renderToStaticMarkup(createElement("div", null, ferm.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Diacetyl rest");
    expect(text).toContain("Total 18 days");
    expect(text).toMatch(/dry hop day 4 falls in Primary/);
    expect(text).toContain("Add stage");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "places the dry hop"`
Expected: FAIL — the screen does not exist.

- [ ] **Step 3: Add the screen record**

Insert after the `Mash step` record:

```tsx
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Fermentation schedule",
    to: { "Add stage": "Fermentation stage" },
    job: "State the temperatures and days a batch is meant to hold",
    reads: "get_recipe [design; the version's fermentation_schedule array]",
    writes: "create_recipe_version [design; written with its version, never alone; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "stages add, reorder and delete"], ["frozen", "a cut version reads only · create the next version to change it", 1], ["empty", "no stages yet: Add stage is the only action"]],
    spec: "The same shape as Mash schedule and for the same reason. The footer places the dry hop because Recipe draws “Citra · dry hop · day 4”, and a day number means nothing without this list: day 4 is the last day of Primary, which is why a brewer chose it. The scalar fermentation_days and conditioning_days v1 kept beside this array are dropped — the list sums to them, and two sources for one number is the failure this design keeps removing.",
    body: (<>
      {E.back("Recipe", "Hazy IPA v4 · Fermentation", E.btn("Add stage"))}
      {E.row("Primary", "68 °F · 4 days", E.act("Edit"))}
      {E.row("Diacetyl rest", "72 °F · 2 days", E.act("Edit"))}
      {E.row("Cold crash", "34 °F · 2 days", E.act("Edit"))}
      {E.row("Conditioning", "34 °F · 10 days", E.act("Edit"))}
      {E.info("Total 18 days · dry hop day 4 falls in Primary.")}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Fermentation stage",
    to: { "Save stage": "Fermentation schedule", "Delete stage": "Fermentation schedule" },
    job: "One stage: a temperature held for a number of days",
    reads: "get_recipe [design]",
    writes: "create_recipe_version [design; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "Stage type and name both stay, as on Mash step: two custom stages need the type to say what happens and the name to say which one. Position comes from list order.",
    body: (<>
      {E.edit("Stage name", "Diacetyl rest")}
      {E.pick("Stage", "diacetyl rest", ["primary", "secondary", "diacetyl rest", "cold crash", "conditioning", "lagering", "custom"])}
      {E.cols(
        E.edit("Temp °F", "72", "number"),
        E.edit("Duration days", "2", "number"),
      )}
      {E.edit("Notes · optional", "")}
      {E.btns([["Delete stage", "g"], "Save stage"])}
    </>),
  },
```

- [ ] **Step 4: Add the link rules**

In `lib/mgr/screen-links.ts` `TAPS`:

```ts
  [/^Fermentation schedule · /, "Fermentation schedule"],
  ["Add stage", "Fermentation stage"],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "places the dry hop"`
Expected: PASS

- [ ] **Step 6: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts tests/mgr-screens.test.ts
git commit -m "ui: a fermentation schedule, and the dry hop it places

Same shape as the mash schedule. The footer says where day 4 falls, because
Recipe draws a dry hop on a day number and that number means nothing without
this list. v1's fermentation_days and conditioning_days scalars are dropped:
the list sums to them."
```

---

### Task 4: Water profiles catalog

**Files:**
- Modify: `components/mgr/screens.tsx` (new records after `Format`; add a nav row to `Catalog` at line 1502)
- Modify: `lib/mgr/screen-links.ts`
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the screen names `"Water profiles"` and `"Water profile"`; Task 5's
  Water surface picks from this catalog.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("keeps water profiles in the catalog, with their ion values", () => {
    const list = SCREENS.find((s) => s.name === "Water profiles")!;
    const text = renderToStaticMarkup(createElement("div", null, list.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Burton");
    expect(text).toContain("SO₄ 610");
    const catalog = SCREENS.find((s) => s.name === "Catalog")!;
    const catalogText = renderToStaticMarkup(createElement("div", null, catalog.body))
      .replace(/<[^>]*>/g, " ");
    expect(catalogText).toContain("Water profiles");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "water profiles in the catalog"`
Expected: FAIL — the screen does not exist.

- [ ] **Step 3: Add the two screen records**

Insert after the `Format` record:

```tsx
  {
    step: 5,
    slice: 1,
    tab: "More",
    name: "Water profiles",
    to: { Edit: "Water profile" },
    job: "Keep the water a brewery starts from and the waters it aims at",
    reads: "list_water_profiles [design]",
    writes: "none [creation and editing happen on Water profile]",
    states: [["permission", "brewer or admin required", 1], ["source", "the brewery's own supply · set once in Settings", 0], ["empty", "no profiles yet: Add profile is the only action"]],
    spec: "A catalog entity beside Formats and Price groups, because a profile is referenced by many recipes and edited in one place: a new water report is one edit, not fifty. No quick-create dialog — v1 needed one because profiles were buried inside the recipe form, and reached from Catalog, Add profile is already one tap away.",
    body: (<>
      {E.back("Catalog", "Water profiles", E.btn("Add profile"))}
      {E.row("Municipal · Denver", "Ca 42 · Mg 8 · Na 22 · SO₄ 65 · Cl 30 · HCO₃ 110", E.act("Edit"))}
      {E.row("Burton", "Ca 275 · Mg 40 · Na 25 · SO₄ 610 · Cl 35 · HCO₃ 270", E.act("Edit"))}
      {E.row("Hazy target", "Ca 110 · Mg 10 · Na 15 · SO₄ 90 · Cl 180 · HCO₃ 40", E.act("Edit"))}
    </>),
  },
  {
    step: 5,
    slice: 1,
    tab: "More",
    surface: "sheet",
    name: "Water profile",
    to: { "Save profile": "Water profiles" },
    job: "Name a water and its six ions",
    reads: "get_water_profile [design]",
    writes: "upsert_water_profile [design; SCHEMA-GATE: water_profiles table]",
    states: [["permission", "brewer or admin required", 1], ["in use", "a profile a recipe references cannot be deleted", 1]],
    spec: "Six ions in parts per million, the set every brewing water calculation reads. No ion arithmetic here: this screen records a measurement or a target, and any delta between two profiles is a calculation this slice does not build.",
    body: (<>
      {E.edit("Profile name", "Hazy target")}
      {E.cols(
        E.edit("Calcium ppm", "110", "number"),
        E.edit("Magnesium ppm", "10", "number"),
      )}
      {E.cols(
        E.edit("Sodium ppm", "15", "number"),
        E.edit("Sulfate ppm", "90", "number"),
      )}
      {E.cols(
        E.edit("Chloride ppm", "180", "number"),
        E.edit("Bicarbonate ppm", "40", "number"),
      )}
      {E.btn("Save profile")}
    </>),
  },
```

- [ ] **Step 4: Link it from Catalog**

In the `Catalog` record's `body`, after the `Price lists` nav row:

```tsx
      {E.nav("Water profiles", "3 profiles")}
```

- [ ] **Step 5: Add the link rules**

In `lib/mgr/screen-links.ts` `TAPS`:

```ts
  ["Add profile", "Water profile"],
  [/^(Municipal|Burton|Hazy target)\b/, "Water profile"],
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "water profiles in the catalog"`
Expected: PASS

- [ ] **Step 7: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts tests/mgr-screens.test.ts
git commit -m "ui: water profiles are a catalog entity

A profile is referenced by many recipes and edited in one place, so a new water
report is one edit rather than fifty. No quick-create: reached from Catalog,
Add profile is already one tap away, which is the only thing v1's dialog bought."
```

---

### Task 5: The Water surface

**Files:**
- Modify: `components/mgr/screens.tsx` (new record after `Fermentation stage`)
- Modify: `lib/mgr/screen-links.ts`
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the `Water profiles` catalog (Task 4).
- Produces: the screen name `"Water"`, resolved by Task 6's Recipe link row.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("gives water one stage axis and a brewery-default source", () => {
    const water = SCREENS.find((s) => s.name === "Water")!;
    const text = renderToStaticMarkup(createElement("div", null, water.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Gypsum");
    expect(text).toMatch(/brewery default/);
    expect(text).toContain("Target mash pH");
    // Spec D7: one stage axis. A salt row never carries both a timing and a target.
    expect(text).not.toMatch(/mash water|sparge water|kettle/i);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "one stage axis"`
Expected: FAIL — the screen does not exist.

- [ ] **Step 3: Add the screen record**

Insert after the `Fermentation stage` record:

```tsx
  {
    step: 7,
    slice: 3,
    tab: "More",
    name: "Water",
    to: { Add: "Water addition", Edit: "Water addition" },
    job: "State the water a version starts from, aims at, and what goes in it",
    reads: "get_recipe [design] · list_water_profiles [design]",
    writes: "create_recipe_version [design; water columns and the water-chemistry additions are written with the version; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["brewery source", "the source profile comes from Settings unless this version overrides it"], ["overridden source", "an RO blend or a second supply", 0], ["draft", "additions add, reorder and delete"], ["frozen", "a cut version reads only", 1]],
    spec: "Source water is what comes out of the tap, so it is a Settings value and this screen shows it as the brewery default; a version overrides it only for the case that genuinely varies, an RO blend or a second supply. v1 stored it per recipe, so every recipe repeated the same municipal profile and a new water report meant editing all of them. Each addition carries one stage, not v1's pair of timing and target: for water chemistry those are one axis wearing two hats, since a salt added at mash time goes into the mash water by definition. The SO₄:Cl line is example text; ion deltas, salt contribution and pH prediction are calculations this slice does not build, and if they arrive they go through the same shared-formula rule Recipe sets for OG/FG/ABV.",
    body: (<>
      {E.back("Recipe", "Hazy IPA v4 · Water")}
      {E.fld("Source profile", "Municipal · Denver · brewery default")}
      {E.pick("Target profile", "Hazy target", ["Hazy target", "Burton", "Municipal · Denver"])}
      {E.cols(
        E.edit("Mash water gal", "9.5", "number"),
        E.edit("Sparge water gal", "12.0", "number"),
      )}
      {E.edit("Target mash pH", "5.35", "number")}
      {E.ttl("Salts and acids")}
      {E.row("Gypsum", "4.0 g · mash", E.act("Edit"))}
      {E.row("Calcium chloride", "6.0 g · mash", E.act("Edit"))}
      {E.row("Gypsum", "2.0 g · sparge", E.act("Edit"))}
      {E.row("Lactic acid", "3.0 mL · sparge", E.act("Edit"))}
      {E.row("Add addition", "material · amount · stage", E.act("Add"))}
      {E.info("SO₄:Cl 0.9 · chloride-forward, as the target says.")}
    </>),
  },
  {
    step: 7,
    slice: 3,
    tab: "More",
    surface: "sheet",
    name: "Water addition",
    to: { "Save addition": "Water", "Delete addition": "Water" },
    job: "One salt or acid, its amount, and where it goes",
    reads: "get_recipe [design] · list_materials",
    writes: "create_recipe_version [design; SCHEMA-GATE: recipe process spec]",
    states: [["permission", "brewer or admin required", 1], ["draft", "editable until the version is cut"], ["frozen", "a cut version reads only", 1]],
    spec: "One stage field, never a timing and a target both (spec D7). The material comes from the materials catalog that already exists, so a salt is bought, stocked and consumed like any other input.",
    body: (<>
      {E.pick("Material", "Gypsum", ["Gypsum", "Calcium chloride", "Epsom salt", "Lactic acid", "Phosphoric acid"])}
      {E.cols(
        E.edit("Amount", "4.0", "number"),
        E.pick("Unit", "g", ["g", "mL", "oz"]),
      )}
      {E.pick("Stage", "mash", ["mash", "sparge", "kettle"])}
      {E.btns([["Delete addition", "g"], "Save addition"])}
    </>),
  },
```

- [ ] **Step 4: Add the link rules**

In `lib/mgr/screen-links.ts` `TAPS`:

```ts
  [/^Water · /, "Water"],
  ["Add addition", "Water addition"],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "one stage axis"`
Expected: PASS

- [ ] **Step 6: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts tests/mgr-screens.test.ts
git commit -m "ui: water profiles, volumes and the salts that close the gap

Profiles alone are inert: knowing you are at 65 ppm sulfate and want 90 does
not tell anyone what to put in the mash tun. Source water is a Settings value
shown here as the brewery default, because it is what comes out of the tap and
does not change per recipe. One stage per addition, not v1's timing-and-target
pair, which for water chemistry is one axis wearing two hats."
```

---

### Task 6: Recipe gains its scalars, links and Notes; loses Mash temp

**Files:**
- Modify: `components/mgr/screens.tsx:2437-2460` (the `Recipe` record)
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the screen names `"Mash schedule"` (Task 2),
  `"Fermentation schedule"` (Task 3), `"Water"` (Task 5).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("makes a recipe version executable without restating the batch size", () => {
    const recipe = SCREENS.find((s) => s.name === "Recipe")!;
    const text = renderToStaticMarkup(createElement("div", null, recipe.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toContain("Pre-boil volume");
    expect(text).toContain("Boil time");
    expect(text).toContain("Whirlpool rest");
    expect(text).toContain("Knockout temp");
    expect(text).toContain("Notes");
    expect(text).toContain("Mash schedule · 3 steps");
    expect(text).toContain("Fermentation schedule · 4 stages");
    expect(text).toMatch(/Water · /);
    // Spec D4: one place holds the mash temperature, and it is the schedule.
    expect(text).not.toMatch(/Mash temp/);
    // Spec D3: the scale chips already state the batch size.
    expect(text).not.toMatch(/Batch size|Knockout volume/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "without restating the batch size"`
Expected: FAIL — "Pre-boil volume" is absent and "Mash temp" is present.

- [ ] **Step 3: Rewrite the Recipe body**

Replace the `Recipe` record's `body` with:

```tsx
    body: (<>
      {E.back("Recipes", "Hazy IPA v4")}
      {E.row("Recipe parent · Hazy IPA · IPA", "name and style only", E.act("Create"))}
      {E.chips(["per bbl", "15 bbl", "30 bbl"], 1)}
      {E.row("2-row", "mash · 44 lb / bbl", "660 lb")}
      {E.row("Citra", "boil · 10 min · 0.4 lb / bbl", "6 lb")}
      {E.row("Citra", "dry hop · day 4 · 1.2 lb / bbl", "18 lb")}
      {E.row("+ add ingredient", "material · stage · timing", "")}
      {E.cols(
        E.edit("Pre-boil volume bbl", "16.8", "number"),
        E.edit("Boil time min", "60", "number"),
      )}
      {E.cols(
        E.edit("Whirlpool min", "20", "number"),
        E.edit("Whirlpool temp °F", "180", "number"),
      )}
      {E.cols(
        E.edit("Whirlpool rest min", "10", "number"),
        E.edit("Knockout temp °F", "65", "number"),
      )}
      {E.cols(
        E.edit("Brewhouse efficiency %", "72", "number"),
        E.edit("Yeast attenuation %", "78", "number"),
      )}
      {E.nav("Mash schedule · 3 steps", "152 °F saccharification rest")}
      {E.nav("Fermentation schedule · 4 stages", "18 days · dry hop day 4 in Primary")}
      {E.nav("Water · Municipal Denver → Hazy target", "4 salts and acids")}
      {E.edit("Notes", "Whirlpool hard, knock out cold.")}
      {E.info("Predicted: OG 15.2 °P · FG 3.3 °P · ABV 6.5%")}
      {E.tape([["B-0413 · OG 14.8 · FG 3.5 · ABV 6.0%", "eff 68% · att 76%"], ["B-0398 · OG 15.1 · FG 3.4 · ABV 6.3%", "eff 71% · att 77%"]])}
      {E.note("Actuals run −0.4 °P OG vs predicted (eff 68–71% vs 72% assumed). Lower the assumption on v5?")}
      {E.gated("Create recipe version", "isn’t available yet: assumptions have no columns to live in. A brewery with no version cannot schedule a batch, so brew day waits on this too")}
    </>),
```

- [ ] **Step 4: Extend the spec sentence**

Append to the `Recipe` record's existing `spec` string, before its closing quote:

```
 A version is the executable process spec, not only the prediction inputs: volumes, boil, whirlpool and knockout are scalars here, while the mash and fermentation schedules and water open as their own screens because they repeat and carry add, reorder and delete. Mash temp is gone — every mash step carries a temp, and a separate scalar is a second answer to one question. Batch size and knockout volume are gone too: the scale chips already state the batch size and Brew day already records knockout volume as its baseline. Three note fields become one.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "without restating the batch size"`
Expected: PASS

- [ ] **Step 6: Run the proof**

Run the Global Constraints proof command. Expected: PASS. `tap-coverage` must
resolve the three new nav rows via the Task 2/3/5 rules; a miss means a label
and its regex disagree.

- [ ] **Step 7: Commit**

```bash
git add components/mgr/screens.tsx tests/mgr-screens.test.ts
git commit -m "ui: a recipe version you can brew from

Volumes, boil, whirlpool and knockout inline; the two schedules and water open
as their own screens because they repeat. Mash temp leaves: every step carries
a temp and a scalar beside them is a second answer that can disagree. Batch
size and knockout volume leave too — the scale chips state one and Brew day
records the other. One Notes field, not v1's three."
```

---

### Task 7: Brew day reads the sheet

**Files:**
- Modify: `components/mgr/screens.tsx:1986-2003` (the `Brew day` record)
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the screen name `"Mash schedule"` (Task 2).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("gives brew day the sheet to follow and no new capture", () => {
    const brew = SCREENS.find((s) => s.name === "Brew day")!;
    const text = renderToStaticMarkup(createElement("div", null, brew.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toMatch(/Brew sheet · Hazy IPA v4/);
    // Spec D10: it reads the spec, it does not capture mash actuals.
    expect(text).not.toMatch(/Actual mash|Mash actual/i);
    expect(brew.writes).toBe("record_brew_day [design; one RPC: additions + material movements + occupancy]");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "the sheet to follow"`
Expected: FAIL — "Brew sheet" is not in the markup.

- [ ] **Step 3: Add the row**

In the `Brew day` record's `body`, after the `Knockout baseline` field:

```tsx
      {E.nav("Brew sheet · Hazy IPA v4", "mash 3 steps · whirlpool 20 min · read-only")}
```

- [ ] **Step 4: Add the link rule**

In `lib/mgr/screen-links.ts` `TAPS`:

```ts
  [/^Brew sheet · /, "Mash schedule"],
```

- [ ] **Step 5: Extend the spec sentence**

Append to the `Brew day` record's existing `spec`, before its closing quote:

```
 The brew sheet row is a read-out of the version's process spec, opened frozen; brew day captures actuals (lots, knockout baseline) and fermentation reality arrives through Fermentation reading, so there is no mash-actuals form here.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "the sheet to follow"`
Expected: PASS

- [ ] **Step 7: Run the proof**

Run the Global Constraints proof command. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts tests/mgr-screens.test.ts
git commit -m "ui: brew day reads the brew sheet

One read-only row opening the version's mash schedule frozen. No new capture:
brew day already records the actual lots and the knockout baseline, and
fermentation reality arrives through Fermentation reading."
```

---

### Task 8: The brewery's source water, and the guide

**Files:**
- Modify: `components/mgr/screens.tsx` (the `Settings` record)
- Modify: `content/docs/staff-guide.mdx`
- Test: `tests/mgr-screens.test.ts`

**Interfaces:**
- Consumes: the `Water profiles` catalog (Task 4).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `tests/mgr-screens.test.ts`:

```ts
it("sets the brewery's source water once, in Settings", () => {
    const settings = SCREENS.find((s) => s.name === "Settings")!;
    const text = renderToStaticMarkup(createElement("div", null, settings.body))
      .replace(/<[^>]*>/g, " ");
    expect(text).toMatch(/Source water/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "source water once"`
Expected: FAIL — "Source water" is not in the markup.

- [ ] **Step 3: Add the setting**

In the `Settings` record's `body`, beside the other brewery-wide values:

```tsx
      {E.nav("Source water · Municipal · Denver", "every recipe starts here unless it overrides")}
```

- [ ] **Step 4: Add the link rule**

In `lib/mgr/screen-links.ts` `TAPS`:

```ts
  [/^Source water · /, "Water profiles"],
```

- [ ] **Step 5: Document it for customers**

In `content/docs/staff-guide.mdx`, in the recipe section (search for
`Recipes`; if no recipe section exists yet, add one immediately before the
Compliance section), add:

```markdown
### Recipes

A recipe version is the process spec a brewer follows: the ingredients and
their stages, the pre-boil volume and boil time, the whirlpool and knockout
temperatures, and links to the mash schedule, the fermentation schedule, and
the water. A version cannot be edited once it is cut — create the next version
instead, so what a past batch was brewed from stays true.

Your source water is set once in Settings and every recipe starts from it. A
recipe overrides it only when that batch genuinely uses different water, such
as an RO blend.
```

Note: `tests/docs.test.ts` forbids code blocks in the customer guides. Prose
and headings only — no fenced blocks in the MDX you add.

- [ ] **Step 6: Run test to verify it passes**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "source water once"`
Expected: PASS

- [ ] **Step 7: Run the proof**

Run the Global Constraints proof command. Expected: PASS, `tests/docs.test.ts`
included.

- [ ] **Step 8: Look at the rendered pages**

Run `bun run dev`, read the port it prints (another worktree may hold 3000), and
open `/docs/screens`. Confirm Recipe, both schedules, Water, and Water profiles
render and that Recipe is not visually overwhelming at phone width.

- [ ] **Step 9: Commit**

```bash
git add components/mgr/screens.tsx lib/mgr/screen-links.ts \
  content/docs/staff-guide.mdx tests/mgr-screens.test.ts
git commit -m "ui: the brewery's source water is a setting, and the guide says so

Source water is what comes out of the tap, so it is set once and every recipe
starts from it; a recipe overrides it only for an RO blend or a second supply.
The staff guide gains the recipe section this slice makes true."
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task |
| --- | --- |
| D1 version is the executable process spec | 6 |
| D2 repetition earns a surface | 2, 3, 5 |
| D3 chips already state the batch size | 6 (test asserts the absence) |
| D4 Mash temp leaves Recipe | 1, 2, 6 |
| D5 schedules replace scalar totals | 3 |
| D6 step type and name both stay | 2, 3 |
| D7 one stage axis for water | 5 (test asserts the absence of the second) |
| D8 source profile belongs to the brewery | 5, 8 |
| D9 one Notes field | 6 |
| D10 no new capture on Brew day | 7 |
| Recipe screen | 6 |
| Mash schedule / Mash step | 2 |
| Fermentation schedule / Fermentation stage | 3 |
| Water / Water addition | 5 |
| Water profiles / Water profile | 4 |
| Brew day | 7 |
| Settings source water | 8 |
| `lib/mgr/recipe-schedule.ts` | 1 |
| Schema gates named | every task's `writes` tag |

**Placeholder scan:** none. Every code step carries literal text.

**Type consistency:** `Step`, `totalDuration`, `saccharificationRest` are
defined in Task 1 and referenced by name in Tasks 2 and 3. Screen names are used
consistently: `"Mash schedule"`, `"Mash step"`, `"Fermentation schedule"`,
`"Fermentation stage"`, `"Water"`, `"Water addition"`, `"Water profiles"`,
`"Water profile"`.

**Ordering constraint:** Task 6 links to screens created in Tasks 2, 3 and 5, so
it must run after them. Task 7 links to Task 2's screen. Tasks 1–5 are
independent of each other apart from Task 2 and 3 consuming Task 1's helper.

**Known risk:** Task 6 grows the Recipe screen from 9 rows to about 22. Step 8
of Task 8 is the eyeball check; if it reads as too dense at phone width, the
lever is moving the four assumption and whirlpool `cols` pairs behind a fifth
link row, not deleting fields.
