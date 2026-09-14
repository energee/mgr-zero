# Water salt suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Water screen suggests brewing-salt additions that bring source water closest to the target profile over total brewing water, lets the brewer adjust them, and shows where each of the six ions lands against target.

**Architecture:** One pure module (`lib/water-chemistry.ts`) holds the salt ion table, the read-out and a non-negative least-squares solver; nothing is stored. Draft helpers in `lib/mgr/recipe-process-view.ts` split a suggestion by stage and merge it into the additions list. The shared `WaterView` draws the verb and the six-ion rows for both the inventory fixture and the live sheet; live draws them gated until `materials.salt` exists (PR B, not in this plan).

**Tech Stack:** TypeScript, React 19 (Next.js 16 App Router), vitest, the `E` drawing vocabulary in `components/mgr/e.tsx`.

**Spec:** `.agents/superpowers/specs/2026-09-14-water-salt-suggestions-design.md`

## Global Constraints

- Worktree `.agents/worktrees/feat-water-salt-suggestions`, branch `feat/water-salt-suggestions`, base `main`. Run `pwd && git branch --show-current` before the first edit.
- No migration, no command change, no database work in this plan (spec: PR B). Nothing computed is stored.
- Never invent a salt from a material's name: a material with `salt === undefined` means the schema does not carry it yet, and the view draws gated.
- Volume basis is total brewing water = mash gal + sparge gal; 1 gal = 3.78541 L; `oz` = 28.3495 g; `mL` counts as grams.
- Copy rules (tests/mgr-screens.test.ts): no snake_case identifiers, no em dashes, no HTML entities in any rendered body, spec or state text.
- Proof for every task: `bunx tsc --noEmit && bun run lint` plus the vitest files named in the task. Full pure set before the PR: `bunx vitest run tests/water-chemistry.test.ts tests/recipe-process-view.test.ts tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts tests/production-view.test.ts tests/app-screen-parity.test.ts tests/api-docs.test.ts`.
- Commit messages end with `Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF`. No Co-Authored-By.

---

### Task 1: Ion table and read-out (`waterChemistry`)

**Files:**
- Create: `lib/water-chemistry.ts`
- Test: `tests/water-chemistry.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Ions = { calcium: number; magnesium: number; sodium: number; sulfate: number; chloride: number; bicarbonate: number };
  export const IONS: (keyof Ions)[]; // drawing order: calcium, magnesium, sodium, sulfate, chloride, bicarbonate
  export const ION_LABELS: Record<keyof Ions, string>; // "Calcium", …
  export type Salt = "gypsum" | "calcium_chloride" | "epsom_salt" | "baking_soda" | "chalk" | "table_salt" | "magnesium_chloride";
  export const SALTS: Salt[];
  export const SALT_LABELS: Record<Salt, string>; // "Gypsum", "Calcium chloride", "Epsom salt", "Baking soda", "Chalk", "Table salt", "Magnesium chloride"
  export const SALT_PPM_PER_G_PER_L: Record<Salt, Partial<Ions>>;
  export const GAL_TO_L = 3.78541; export const OZ_TO_G = 28.3495;
  export const gramsOf = (qty: number, unit: string) => number; // "oz" × OZ_TO_G, else qty
  export type IonRow = { ion: keyof Ions; source: number; added: number; result: number; target?: number; delta?: number };
  export function waterChemistry(input: { source: Ions; target?: Ions; mashGal: number; spargeGal: number; additions: { salt: Salt | null | undefined; grams: number }[] }): IonRow[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/water-chemistry.test.ts — the one water formula (spec 2026-09-14): salt ppm, read-out and the solver.
import { describe, expect, it } from "vitest";
import { gramsOf, suggestSalts, waterChemistry, type Ions } from "@/lib/water-chemistry";

const denver: Ions = { calcium: 42, magnesium: 8, sodium: 22, sulfate: 65, chloride: 30, bicarbonate: 110 };
const hazy: Ions = { calcium: 110, magnesium: 10, sodium: 15, sulfate: 90, chloride: 180, bicarbonate: 40 };
const tenLiters = { mashGal: 10 / 3.78541, spargeGal: 0 };

describe("waterChemistry", () => {
  it("adds textbook ppm for 1 g gypsum in 10 L", () => {
    const rows = waterChemistry({ source: denver, ...tenLiters, additions: [{ salt: "gypsum", grams: 1 }] });
    const ca = rows.find((r) => r.ion === "calcium")!, so4 = rows.find((r) => r.ion === "sulfate")!;
    expect(ca.added).toBeCloseTo(23.28, 1);
    expect(ca.result).toBeCloseTo(65.28, 1);
    expect(so4.added).toBeCloseTo(55.77, 1);
    expect(rows.find((r) => r.ion === "sodium")!.added).toBe(0);
  });
  it("sums every stage into total water and reports delta against target", () => {
    const rows = waterChemistry({ source: denver, target: hazy, mashGal: 9.5, spargeGal: 12, additions: [{ salt: "calcium_chloride", grams: 6 }, { salt: "gypsum", grams: 4 }] });
    const liters = 21.5 * 3.78541;
    const cl = rows.find((r) => r.ion === "chloride")!;
    expect(cl.added).toBeCloseTo((6 * 482.3) / liters, 2);
    expect(cl.target).toBe(180);
    expect(cl.delta).toBeCloseTo(cl.result - 180, 6);
  });
  it("ignores additions without a salt and returns nothing for zero water", () => {
    expect(waterChemistry({ source: denver, mashGal: 0, spargeGal: 0, additions: [] })).toEqual([]);
    const rows = waterChemistry({ source: denver, ...tenLiters, additions: [{ salt: null, grams: 5 }, { salt: undefined, grams: 5 }] });
    expect(rows.every((r) => r.added === 0)).toBe(true);
  });
  it("converts ounces to grams and leaves grams alone", () => {
    expect(gramsOf(1, "oz")).toBeCloseTo(28.3495, 4);
    expect(gramsOf(3, "g")).toBe(3);
    expect(gramsOf(3, "mL")).toBe(3);
  });
  it("rejects negative water", () => {
    expect(() => waterChemistry({ source: denver, mashGal: -1, spargeGal: 0, additions: [] })).toThrow();
  });
});

describe("suggestSalts", () => {
  it("reproduces a hand-worked two-salt fit within 0.1 g and never goes negative", () => {
    // 10 L; need +40 Ca, +25 SO4, +100 Cl over source: gypsum for sulfate, calcium chloride for chloride.
    const target: Ions = { ...denver, calcium: denver.calcium + 40, sulfate: denver.sulfate + 25, chloride: denver.chloride + 100 };
    const out = suggestSalts({ source: denver, target, totalGal: 10 / 3.78541, salts: ["gypsum", "calcium_chloride"] });
    const grams = Object.fromEntries(out.map((s) => [s.salt, s.grams]));
    // Cl comes only from CaCl2: 100 ppm × 10 L / 482.3 = 2.07 g; SO4 only from gypsum: 25 × 10 / 557.7 = 0.45 g.
    expect(grams.calcium_chloride).toBeCloseTo(2.1, 1);
    expect(grams.gypsum).toBeCloseTo(0.4, 1);
    expect(out.every((s) => s.grams >= 0)).toBe(true);
  });
  it("returns nothing when the target is already met or no salts are stocked", () => {
    expect(suggestSalts({ source: denver, target: denver, totalGal: 5, salts: ["gypsum"] })).toEqual([]);
    expect(suggestSalts({ source: denver, target: hazy, totalGal: 5, salts: [] })).toEqual([]);
  });
  it("only uses the salts it is given and drops zeros", () => {
    const out = suggestSalts({ source: denver, target: hazy, totalGal: 21.5, salts: ["gypsum", "calcium_chloride", "epsom_salt"] });
    expect(out.every((s) => ["gypsum", "calcium_chloride", "epsom_salt"].includes(s.salt))).toBe(true);
    expect(out.every((s) => s.grams > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/water-chemistry.test.ts`
Expected: FAIL, cannot find module `@/lib/water-chemistry`.

- [ ] **Step 3: Write the module (read-out only; the solver comes in Task 2 but export a stub so the file compiles)**

```ts
// lib/water-chemistry.ts — the one water formula (spec
// 2026-09-14-water-salt-suggestions): what each brewing salt adds per gram
// per liter, the six-ion read-out of a version's water over its total
// brewing water, and the non-negative least-squares suggestion. Pure and
// registry-layer, like lib/recipe-gravity.ts: the editor preview and any
// server read call these; nothing here is ever stored.

export type Ions = { calcium: number; magnesium: number; sodium: number; sulfate: number; chloride: number; bicarbonate: number };
export const IONS = ["calcium", "magnesium", "sodium", "sulfate", "chloride", "bicarbonate"] as const satisfies readonly (keyof Ions)[];
export const ION_LABELS: Record<keyof Ions, string> = { calcium: "Calcium", magnesium: "Magnesium", sodium: "Sodium", sulfate: "Sulfate", chloride: "Chloride", bicarbonate: "Bicarbonate" };

export type Salt = "gypsum" | "calcium_chloride" | "epsom_salt" | "baking_soda" | "chalk" | "table_salt" | "magnesium_chloride";
export const SALTS: Salt[] = ["gypsum", "calcium_chloride", "epsom_salt", "baking_soda", "chalk", "table_salt", "magnesium_chloride"];
export const SALT_LABELS: Record<Salt, string> = {
  gypsum: "Gypsum", calcium_chloride: "Calcium chloride", epsom_salt: "Epsom salt", baking_soda: "Baking soda",
  chalk: "Chalk", table_salt: "Table salt", magnesium_chloride: "Magnesium chloride",
};
/** ppm added per gram of salt per liter of water. One place; correct it here only. */
export const SALT_PPM_PER_G_PER_L: Record<Salt, Partial<Ions>> = {
  gypsum: { calcium: 232.8, sulfate: 557.7 },
  calcium_chloride: { calcium: 272.6, chloride: 482.3 },
  epsom_salt: { magnesium: 98.6, sulfate: 389.6 },
  baking_soda: { sodium: 273.7, bicarbonate: 726.3 },
  chalk: { calcium: 400.5, bicarbonate: 1219.7 },
  table_salt: { sodium: 393.4, chloride: 606.6 },
  magnesium_chloride: { magnesium: 119.5, chloride: 348.7 },
};

export const GAL_TO_L = 3.78541;
export const OZ_TO_G = 28.3495;
/** Grams from an addition's qty and unit; mL is treated as grams (acids, which the solver never touches). */
export const gramsOf = (qty: number, unit: string) => (unit === "oz" ? qty * OZ_TO_G : qty);

export type IonRow = { ion: keyof Ions; source: number; added: number; result: number; target?: number; delta?: number };

const liters = (mashGal: number, spargeGal: number) => {
  if (mashGal < 0 || spargeGal < 0) throw new Error("water volume cannot be negative");
  return (mashGal + spargeGal) * GAL_TO_L;
};

/** Where every ion lands: source plus what the additions add over total brewing water, against the target when there is one. */
export function waterChemistry({ source, target, mashGal, spargeGal, additions }: {
  source: Ions; target?: Ions; mashGal: number; spargeGal: number; additions: { salt: Salt | null | undefined; grams: number }[];
}): IonRow[] {
  const L = liters(mashGal, spargeGal);
  if (L === 0) return [];
  return IONS.map((ion) => {
    const added = additions.reduce((sum, a) => sum + (a.salt ? (SALT_PPM_PER_G_PER_L[a.salt][ion] ?? 0) * a.grams / L : 0), 0);
    const result = source[ion] + added;
    return { ion, source: source[ion], added, result, target: target?.[ion], delta: target ? result - target[ion] : undefined };
  });
}

export function suggestSalts(_input: { source: Ions; target: Ions; totalGal: number; salts: Salt[] }): { salt: Salt; grams: number }[] {
  return [];
}
```

- [ ] **Step 4: Run the read-out tests**

Run: `bunx vitest run tests/water-chemistry.test.ts -t waterChemistry`
Expected: PASS (5 tests). The `suggestSalts` block still fails; that is Task 2.

- [ ] **Step 5: Commit**

```bash
git add lib/water-chemistry.ts tests/water-chemistry.test.ts
git commit -m "feat(water): salt ion table and six-ion read-out

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```

---

### Task 2: Non-negative least-squares suggestion (`suggestSalts`)

**Files:**
- Modify: `lib/water-chemistry.ts` (replace the stub)
- Test: `tests/water-chemistry.test.ts` (already written in Task 1)

**Interfaces:**
- Produces: `suggestSalts({ source, target, totalGal, salts }): { salt: Salt; grams: number }[]`, grams rounded to 0.1, zeros dropped, order = `SALTS` order.

- [ ] **Step 1: Run the solver tests to see them fail**

Run: `bunx vitest run tests/water-chemistry.test.ts -t suggestSalts`
Expected: FAIL on the hand-worked case (grams undefined).

- [ ] **Step 2: Replace the stub with projected gradient descent**

```ts
/** Grams of each stocked salt that bring source closest to target over total brewing water:
 *  least squares on all six ions with every amount ≥ 0. Projected gradient descent with a
 *  fixed cap is enough for seven unknowns; no dependency. */
export function suggestSalts({ source, target, totalGal, salts }: { source: Ions; target: Ions; totalGal: number; salts: Salt[] }): { salt: Salt; grams: number }[] {
  const L = liters(totalGal, 0);
  if (L === 0 || salts.length === 0) return [];
  const want = IONS.map((ion) => target[ion] - source[ion]);            // ppm still needed, per ion
  const a = salts.map((s) => IONS.map((ion) => (SALT_PPM_PER_G_PER_L[s][ion] ?? 0) / L)); // ppm per gram, [salt][ion]
  const step = 1 / a.reduce((sum, row) => sum + row.reduce((q, v) => q + v * v, 0), 0);  // 1 / ||A||²_F keeps the descent stable
  const x = salts.map(() => 0);
  for (let iter = 0; iter < 5000; iter++) {
    const residual = IONS.map((_, i) => a.reduce((sum, row, j) => sum + row[i] * x[j], 0) - want[i]);
    let moved = 0;
    for (let j = 0; j < x.length; j++) {
      const grad = a[j].reduce((sum, v, i) => sum + v * residual[i], 0);
      const next = Math.max(0, x[j] - step * grad);
      moved += Math.abs(next - x[j]);
      x[j] = next;
    }
    if (moved < 1e-6) break;
  }
  return salts.map((salt, j) => ({ salt, grams: Math.round(x[j] * 10) / 10 })).filter((s) => s.grams > 0);
}
```

- [ ] **Step 3: Run the whole file**

Run: `bunx vitest run tests/water-chemistry.test.ts`
Expected: PASS (8 tests). If the hand-worked case is off by more than 0.1 g, raise the iteration cap before touching the tolerance.

- [ ] **Step 4: Commit**

```bash
git add lib/water-chemistry.ts
git commit -m "feat(water): non-negative least-squares salt suggestion

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```

---

### Task 3: Draft helpers: profile ions, stage split, merge

**Files:**
- Modify: `lib/mgr/recipe-process-view.ts` (append after `additionReady`)
- Test: `tests/recipe-process-view.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `Ions`, `Salt`, `suggestSalts`, `waterChemistry`, `gramsOf`, `IONS`, `ION_LABELS` from `@/lib/water-chemistry`; `WaterDraft`, `WaterAddition` (existing).
- Produces:
  ```ts
  export type WaterProfileIons = { id: string; name: string; ions?: Ions };           // a profile option the view can compute from
  export type SaltMaterial = { id: string; name: string; salt?: Salt | null };         // undefined = schema has no salt yet (gated); null = not a salt
  export const profileIons = (p: { calcium_ppm: number; magnesium_ppm: number; sodium_ppm: number; sulfate_ppm: number; chloride_ppm: number; bicarbonate_ppm: number }) => Ions;
  export function splitByStage(grams: number, mashGal: number, spargeGal: number): { mash: number; sparge: number }; // proportional, 0.1 g, a stage that rounds to 0 folds into the other
  export function suggestAdditions(draft: WaterDraft, source: Ions, target: Ions, materials: SaltMaterial[]): WaterAddition[]; // salt additions replaced, everything else kept in place
  export type IonReadoutRow = { ion: string; detail: string; warning: boolean };        // "Sulfate" · "180 of 200 ppm · −20"
  export function ionReadout(draft: WaterDraft, source: Ions, target: Ions | undefined, materials: SaltMaterial[]): IonReadoutRow[];
  export const WARN_PPM = 20;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// append to tests/recipe-process-view.test.ts
import { ionReadout, profileIons, splitByStage, suggestAdditions, type SaltMaterial, type WaterDraft } from "@/lib/mgr/recipe-process-view";

const denverRow = { calcium_ppm: 42, magnesium_ppm: 8, sodium_ppm: 22, sulfate_ppm: 65, chloride_ppm: 30, bicarbonate_ppm: 110 };
const hazyRow = { calcium_ppm: 110, magnesium_ppm: 10, sodium_ppm: 15, sulfate_ppm: 90, chloride_ppm: 180, bicarbonate_ppm: 40 };
const salts: SaltMaterial[] = [{ id: "gypsum", name: "Gypsum", salt: "gypsum" }, { id: "cacl", name: "Calcium chloride", salt: "calcium_chloride" }, { id: "lactic", name: "Lactic acid", salt: null }];
const draft: WaterDraft = { targetProfileId: "hazy", sourceProfileId: "", mashGal: "9.5", spargeGal: "12", targetMashPh: "", additions: [
  { materialId: "gypsum", qty: 4, unit: "g", stage: "mash" }, { materialId: "lactic", qty: 3, unit: "mL", stage: "sparge" },
] };

describe("water suggestions", () => {
  it("maps a profile row to ions", () => {
    expect(profileIons(denverRow)).toEqual({ calcium: 42, magnesium: 8, sodium: 22, sulfate: 65, chloride: 30, bicarbonate: 110 });
  });
  it("splits grams by volume and folds a stage that rounds to zero into the other", () => {
    expect(splitByStage(10, 9.5, 12)).toEqual({ mash: 4.4, sparge: 5.6 });
    expect(splitByStage(0.1, 9.5, 12)).toEqual({ mash: 0, sparge: 0.1 });
    expect(splitByStage(5, 10, 0)).toEqual({ mash: 5, sparge: 0 });
  });
  it("replaces salt additions with the suggestion and keeps acids where they were", () => {
    const out = suggestAdditions(draft, profileIons(denverRow), profileIons(hazyRow), salts);
    expect(out.filter((a) => a.materialId === "lactic")).toEqual([{ materialId: "lactic", qty: 3, unit: "mL", stage: "sparge" }]);
    expect(out.some((a) => a.materialId === "cacl" && a.stage === "mash")).toBe(true);
    expect(out.some((a) => a.materialId === "cacl" && a.stage === "sparge")).toBe(true);
    expect(out.every((a) => a.unit === "g" || a.materialId === "lactic")).toBe(true);
  });
  it("reads out six ions against target and flags a miss over 20 ppm", () => {
    const rows = ionReadout(draft, profileIons(denverRow), profileIons(hazyRow), salts);
    expect(rows.map((r) => r.ion)).toEqual(["Calcium", "Magnesium", "Sodium", "Sulfate", "Chloride", "Bicarbonate"]);
    const cl = rows.find((r) => r.ion === "Chloride")!;
    expect(cl.detail).toMatch(/^30 of 180 ppm · −150$/);
    expect(cl.warning).toBe(true);
    expect(ionReadout(draft, profileIons(denverRow), undefined, salts)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run tests/recipe-process-view.test.ts`
Expected: FAIL, the four helpers are not exported.

- [ ] **Step 3: Implement the helpers**

```ts
// append to lib/mgr/recipe-process-view.ts
import { gramsOf, IONS, ION_LABELS, suggestSalts, waterChemistry, type Ions, type Salt } from "@/lib/water-chemistry";

/** A profile option the Water screen can compute from; `ions` absent means only the name is known. */
export type WaterProfileIons = { id: string; name: string; ions?: Ions };
/** A material as the Water screen sees it: `salt` undefined means the schema carries none yet, null means not a salt. */
export type SaltMaterial = { id: string; name: string; salt?: Salt | null };

export const profileIons = (p: { calcium_ppm: number; magnesium_ppm: number; sodium_ppm: number; sulfate_ppm: number; chloride_ppm: number; bicarbonate_ppm: number }): Ions =>
  ({ calcium: p.calcium_ppm, magnesium: p.magnesium_ppm, sodium: p.sodium_ppm, sulfate: p.sulfate_ppm, chloride: p.chloride_ppm, bicarbonate: p.bicarbonate_ppm });

const tenth = (n: number) => Math.round(n * 10) / 10;
/** Grams split into mash and sparge by volume; a stage that rounds to nothing folds into the other. */
export function splitByStage(grams: number, mashGal: number, spargeGal: number): { mash: number; sparge: number } {
  const total = mashGal + spargeGal;
  if (total <= 0) return { mash: tenth(grams), sparge: 0 };
  const mash = tenth(grams * mashGal / total), sparge = tenth(grams - mash);
  if (mash === 0) return { mash: 0, sparge: tenth(grams) };
  if (sparge === 0) return { mash: tenth(grams), sparge: 0 };
  return { mash, sparge };
}

const saltOf = (materials: SaltMaterial[], id: string) => materials.find((m) => m.id === id)?.salt;
const asSaltAdditions = (draft: WaterDraft, materials: SaltMaterial[]) =>
  draft.additions.map((a) => ({ salt: saltOf(materials, a.materialId), grams: gramsOf(a.qty, a.unit) }));

/** The solver's additions in place of the draft's salts; acids and unknown materials stay where they were. */
export function suggestAdditions(draft: WaterDraft, source: Ions, target: Ions, materials: SaltMaterial[]): WaterAddition[] {
  const mashGal = Number(draft.mashGal) || 0, spargeGal = Number(draft.spargeGal) || 0;
  const stocked = materials.filter((m) => m.salt);
  const kept = draft.additions.filter((a) => !saltOf(materials, a.materialId));
  const suggested = suggestSalts({ source, target, totalGal: mashGal + spargeGal, salts: stocked.map((m) => m.salt as Salt) }).flatMap(({ salt, grams }) => {
    const materialId = stocked.find((m) => m.salt === salt)!.id;
    const { mash, sparge } = splitByStage(grams, mashGal, spargeGal);
    return [mash > 0 ? { materialId, qty: mash, unit: "g", stage: "mash" } : null, sparge > 0 ? { materialId, qty: sparge, unit: "g", stage: "sparge" } : null].filter((a): a is WaterAddition => a !== null);
  });
  return [...suggested, ...kept];
}

export const WARN_PPM = 20;
export type IonReadoutRow = { ion: string; detail: string; warning: boolean };
const ppm = (n: number) => String(Math.round(n));
const signed = (n: number) => (n < 0 ? `−${ppm(-n)}` : `+${ppm(n)}`);
/** Six rows, one per ion: "180 of 200 ppm · −20"; empty without a target. */
export function ionReadout(draft: WaterDraft, source: Ions, target: Ions | undefined, materials: SaltMaterial[]): IonReadoutRow[] {
  if (!target) return [];
  const rows = waterChemistry({ source, target, mashGal: Number(draft.mashGal) || 0, spargeGal: Number(draft.spargeGal) || 0, additions: asSaltAdditions(draft, materials) });
  return rows.map((r) => ({ ion: ION_LABELS[r.ion], detail: `${ppm(r.result)} of ${ppm(r.target!)} ppm · ${signed(r.delta!)}`, warning: Math.abs(r.delta!) > WARN_PPM }));
}
void IONS;
```

Delete the `void IONS;` line and the `IONS` import if nothing uses it after writing.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/recipe-process-view.test.ts tests/water-chemistry.test.ts`
Expected: PASS. Note the chloride expectation: 4 g gypsum adds no chloride, so the read-out is the source 30 against 180.

- [ ] **Step 5: Commit**

```bash
git add lib/mgr/recipe-process-view.ts tests/recipe-process-view.test.ts
git commit -m "feat(water): profile ions, stage split, suggestion merge and ion read-out

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```

---

### Task 4: WaterView draws the verb and the read-out

**Files:**
- Modify: `components/mgr/views/water.tsx`
- Test: `tests/water-view.test.ts` (create)

**Interfaces:**
- Consumes: `ionReadout`, `suggestAdditions`, `WaterProfileIons`, `SaltMaterial` (Task 3).
- Produces: `WaterView` props change: `profiles: WaterProfileIons[]`, `materials: SaltMaterial[]`, new optional `sourceDefault?: Ions` (the brewery default source when `sourceProfileId` is empty). Behavior:
  - `chemistryKnown = materials.some((m) => m.salt !== undefined)`.
  - target = `profiles.find(p => p.id === water.targetProfileId)?.ions`; source = the picked source profile's ions, else `sourceDefault`.
  - Below the additions list: when `!chemistryKnown` → `E.gated("Suggest additions", "arrives with the material salt field")` and `E.gated("Ion read-out", "arrives with the material salt field")`. Else: `E.btn("Suggest additions", "g")` disabled unless target and source and total water > 0; on tap `onChange?.({ additions: suggestAdditions(...) })`; then `E.ttl("Against target")` and one `E.row(ion, detail, "", warning ? "w" : "")` per read-out row, when target and source exist.
  - The fixture (no `onChange`) still draws the verb enabled and the rows.

- [ ] **Step 1: Write the failing test**

```ts
// tests/water-view.test.ts — the Water screen's suggestion verb and ion read-out (spec 2026-09-14).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WaterView } from "@/components/mgr/views/water";
import type { WaterDraft } from "@/lib/mgr/recipe-process-view";

const profiles = [
  { id: "denver", name: "Municipal · Denver", ions: { calcium: 42, magnesium: 8, sodium: 22, sulfate: 65, chloride: 30, bicarbonate: 110 } },
  { id: "hazy", name: "Hazy target", ions: { calcium: 110, magnesium: 10, sodium: 15, sulfate: 90, chloride: 180, bicarbonate: 40 } },
];
const salts = [{ id: "gypsum", name: "Gypsum", salt: "gypsum" as const }, { id: "lactic", name: "Lactic acid", salt: null }];
const draft: WaterDraft = { targetProfileId: "hazy", sourceProfileId: "denver", mashGal: "9.5", spargeGal: "12", targetMashPh: "", additions: [{ materialId: "gypsum", qty: 4, unit: "g", stage: "mash" }] };
const html = (props: Partial<Parameters<typeof WaterView>[0]>) => renderToStaticMarkup(createElement(WaterView, { water: draft, profiles, materials: salts, ...props }));

describe("WaterView", () => {
  it("draws the suggestion verb and six ion rows against the target", () => {
    const out = html({});
    expect(out).toMatch(/Suggest additions/);
    expect(out).toMatch(/Against target/);
    for (const ion of ["Calcium", "Magnesium", "Sodium", "Sulfate", "Chloride", "Bicarbonate"]) expect(out).toContain(ion);
    expect(out).toMatch(/30 of 180 ppm · −150/);
  });
  it("draws both gated when no material carries a salt yet", () => {
    const out = html({ materials: [{ id: "gypsum", name: "Gypsum" }, { id: "lactic", name: "Lactic acid" }] });
    expect(out.match(/data-gated/g)).toHaveLength(2);
    expect(out).not.toMatch(/Against target/);
  });
  it("hides the read-out and disables the verb without a target", () => {
    const out = html({ water: { ...draft, targetProfileId: "" } });
    expect(out).not.toMatch(/Against target/);
    expect(out).toMatch(/<button[^>]*disabled[^>]*>[^<]*Suggest additions/);
  });
  it("the enabled verb is a clickable action, the disabled one a plain disabled button", () => {
    expect(html({})).toMatch(/data-row-action[^>]*>[^<]*Suggest additions/);
    expect(html({ water: { ...draft, mashGal: "0", spargeGal: "0" } })).toMatch(/<button[^>]*disabled/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run tests/water-view.test.ts`
Expected: FAIL, no "Suggest additions" in the markup.

- [ ] **Step 3: Change the view**

Replace the imports and the `WaterView` function in `components/mgr/views/water.tsx` (leave `WaterAdditionView` as is):

```tsx
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/commands/production";
import { ionReadout, suggestAdditions, type SaltMaterial, type WaterAdditionFields, type WaterDraft, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import type { Ions } from "@/lib/water-chemistry";
import { rowVerbs, type ListRowProps } from "./mash-schedule";

export type NamedOption = { id: string; name: string };

export function WaterView({ title = "Water", water, profiles, materials, sourceDefault, onChange, onAdd, ...verbs }: {
  title?: string; water: WaterDraft; profiles: WaterProfileIons[]; materials: SaltMaterial[]; sourceDefault?: Ions;
  onChange?: (patch: Partial<WaterDraft>) => void; onAdd?: () => void;
} & ListRowProps) {
  const bind = (key: "targetProfileId" | "sourceProfileId" | "mashGal" | "spargeGal" | "targetMashPh") => onChange ? { value: water[key] } : { defaultValue: water[key] };
  const name = (list: NamedOption[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  // Chemistry needs a salt identity on materials; until the schema carries one the verb and read-out draw gated, never guessed from a name.
  const chemistryKnown = materials.some((m) => m.salt !== undefined);
  const target = profiles.find((p) => p.id === water.targetProfileId)?.ions;
  const source = water.sourceProfileId ? profiles.find((p) => p.id === water.sourceProfileId)?.ions : sourceDefault;
  const totalGal = (Number(water.mashGal) || 0) + (Number(water.spargeGal) || 0);
  const canSuggest = Boolean(target && source && totalGal > 0);
  const readout = target && source ? ionReadout(water, source, target, materials) : [];
  return <>
    {E.back("Recipe", title)}
    {/* … source profile, target profile, volumes, mash pH and the additions list stay exactly as they are … */}
    {E.row("Add addition", "material · amount · stage", E.act("Add", "primary", undefined, onAdd))}
    {chemistryKnown
      ? canSuggest
        ? E.act("Suggest additions", "primary", undefined, () => target && source && onChange?.({ additions: suggestAdditions(water, source, target, materials) }))
        : E.btn("Suggest additions", "g disabled")
      : E.gated("Suggest additions", "arrives with the material salt field")}
    {chemistryKnown && readout.length > 0 && <>
      {E.ttl("Against target")}
      {readout.map((r) => <div key={r.ion}>{E.row(r.ion, r.detail, "", r.warning ? "w" : "")}</div>)}
    </>}
    {!chemistryKnown && E.gated("Ion read-out", "arrives with the material salt field")}
  </>;
}
```

Keep the existing source/target/volume/pH/addition markup in place of the comment line; only the tail changes. `E.btn(label, kind, href)` takes no click handler, which is why the enabled verb is `E.act` (a Button with `onClick`) and the disabled state is `E.btn` with the `" disabled"` suffix; both render one `<button>`, never nested.

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/water-view.test.ts tests/mgr-screens.test.ts tests/tap-coverage.test.ts`
Expected: water-view PASS. mgr-screens and tap-coverage may fail on the Water record until Task 5 supplies ions and salt identities to the fixture and maps the new taps; that is expected here.

- [ ] **Step 5: Commit**

```bash
git add components/mgr/views/water.tsx tests/water-view.test.ts
git commit -m "feat(water): WaterView suggests additions and reads out ions against target

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```

---

### Task 5: Inventory: fixture ions, salt identities, record spec and taps

**Files:**
- Modify: `components/mgr/screens.tsx` (lines ~303-310: `WATER_PROFILE_OPTIONS`, `SALT_OPTIONS`, `WATER_HAZY`; the Water record ~1970-1984)
- Modify: `lib/mgr/fixtures/catalog.ts` is read only (reuse `waterProfiles`)
- Test: `tests/mgr-screens.test.ts` (append), `tests/tap-coverage.test.ts` (existing, must pass)

**Interfaces:**
- Consumes: `profileIons`, `SaltMaterial`, `WaterProfileIons` (Task 3); `waterProfiles` from `@/lib/mgr/fixtures/catalog`.

- [ ] **Step 1: Write the failing test**

```ts
// append inside describe("SCREENS") in tests/mgr-screens.test.ts
it("suggests salts on Water and shows every ion against target, one row warned", () => {
  const html = body("Water");
  expect(html).toMatch(/Suggest additions/);
  expect(html).toMatch(/Against target/);
  for (const ion of ["Calcium", "Magnesium", "Sodium", "Sulfate", "Chloride", "Bicarbonate"]) expect(html).toContain(ion);
  expect(html).not.toContain("data-gated");
  const water = SCREENS.find((s) => s.name === "Water")!;
  expect(String(water.spec)).toMatch(/waterChemistry|same formula/i);
  expect(String(water.spec)).not.toMatch(/does not build/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run tests/mgr-screens.test.ts -t "suggests salts"`
Expected: FAIL (no "Suggest additions" or a gated row, since `SALT_OPTIONS` carry no `salt`).

- [ ] **Step 3: Update the fixtures and the record**

In `components/mgr/screens.tsx`, replace the three constants:

```tsx
import { waterProfiles } from "@/lib/mgr/fixtures/catalog";
import { profileIons, type SaltMaterial, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";

const WATER_PROFILE_OPTIONS: WaterProfileIons[] = waterProfiles.map((p) => ({ id: p.id, name: p.name, ions: profileIons(p) }));
const SALT_OPTIONS: SaltMaterial[] = [
  { id: "gypsum", name: "Gypsum", salt: "gypsum" }, { id: "cacl", name: "Calcium chloride", salt: "calcium_chloride" }, { id: "epsom", name: "Epsom salt", salt: "epsom_salt" },
  { id: "lactic", name: "Lactic acid", salt: null }, { id: "phos", name: "Phosphoric acid", salt: null },
];
/** The drawn water: Denver source, Hazy target, a suggestion the brewer trimmed (calcium chloride short of target, so Chloride warns). */
const WATER_HAZY: WaterDraft = {
  targetProfileId: "hazy", sourceProfileId: "denver", mashGal: "9.5", spargeGal: "12.0", targetMashPh: "5.35",
  additions: [{ materialId: "gypsum", qty: 4, unit: "g", stage: "mash" }, { materialId: "cacl", qty: 6, unit: "g", stage: "mash" }, { materialId: "lactic", qty: 3, unit: "mL", stage: "sparge" }],
};
```

Check `waterProfiles` is exported from `lib/mgr/fixtures/catalog.ts` (it is, line ~201) and that importing it into `screens.tsx` creates no cycle (`catalog.ts` must not import `screens.tsx`).

On the Water record: add taps `"Suggest additions": "Water"` to `to`, append a state `["suggested", "Suggest additions fills the salts from the solver; acids stay; every row is still editable"]` and `["off target", "an ion more than 20 ppm from target warns", 1]`, and replace the spec's last sentence ("The sulfate to chloride line is example text; ion deltas … same shared formula rule Recipe sets for gravity and strength.") with: "Suggest additions runs the one shared water formula over total brewing water, mash plus sparge, and replaces only the salts; the six rows under Against target read the same formula back, so the preview and any server read agree. pH prediction is still not built."

- [ ] **Step 4: Run the screen suites**

Run: `bunx vitest run tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts`
Expected: PASS. If tap-coverage reports the ion rows as unresolved taps, add `Calcium: "Water"` etc. is wrong; instead the rows carry an empty action so they should not count. If they still count, map them in `to` to "Water" (act in place).

- [ ] **Step 5: Commit**

```bash
git add components/mgr/screens.tsx tests/mgr-screens.test.ts
git commit -m "feat(water): inventory Water draws the suggestion and read-out from fixture ions

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```

---

### Task 6: Live binding, gated

**Files:**
- Modify: `app/(app)/recipes/[id]/schedule-sheets.tsx` (`WaterSheet`)
- Modify: `app/(app)/recipes/[id]/recipe-version-form.tsx` (`profiles` prop type)
- Modify: `app/(app)/recipes/[id]/page.tsx`, `app/(app)/recipes/[id]/new/page.tsx`, `app/(app)/recipes/new/page.tsx` (pass profile ions; `list_water_profiles` already returns the six ppm columns)
- Test: `tests/water-view.test.ts` (append a source test)

**Interfaces:**
- Consumes: `WaterProfileIons`, `SaltMaterial`, `profileIons`.
- Produces: `WaterSheet` props `profiles: WaterProfileIons[]`, `materials: SaltMaterial[]`; `RecipeEditor` prop `profiles: WaterProfileIons[]`.

- [ ] **Step 1: Write the failing source test**

```ts
// append to tests/water-view.test.ts
import { readFileSync } from "node:fs";
it("the live sheet mounts WaterView with profile ions and no salt identity yet, so it draws gated", () => {
  const sheets = readFileSync("app/(app)/recipes/[id]/schedule-sheets.tsx", "utf8");
  expect(sheets).toMatch(/<WaterView\b/);
  expect(sheets).not.toMatch(/Suggest additions|Against target|salt:/);
  for (const page of ["app/(app)/recipes/new/page.tsx", "app/(app)/recipes/[id]/new/page.tsx"]) expect(readFileSync(page, "utf8")).toMatch(/profileIons/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run tests/water-view.test.ts`
Expected: FAIL on the `profileIons` expectation.

- [ ] **Step 3: Thread ions through**

In each of the three pages, where `list_water_profiles` is cast to `Named[]`, cast instead to `(Named & { calcium_ppm: number; magnesium_ppm: number; sodium_ppm: number; sulfate_ppm: number; chloride_ppm: number; bicarbonate_ppm: number })[]` and pass `profiles={profiles.map((p) => ({ id: p.id, name: p.name, ions: profileIons(p) }))}`. In `recipe-version-form.tsx` change `profiles: NamedOption[]` to `profiles: WaterProfileIons[]` and pass `materials={sheetMaterials}` unchanged: `sheetMaterials` has no `salt` key, so `WaterView` sees `salt === undefined` and draws gated. In `schedule-sheets.tsx` change `WaterSheet`'s `profiles`/`materials` prop types to match and pass them straight to `WaterView`. Do not add a `salt` anywhere on the live side.

- [ ] **Step 4: Typecheck and test**

Run: `bunx tsc --noEmit && bunx vitest run tests/water-view.test.ts tests/new-recipe.test.ts tests/production-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(app)/recipes tests/water-view.test.ts
git commit -m "feat(water): live Water sheet gets profile ions; suggestion and read-out gated on the salt field

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```

---

### Task 7: Customer guide and proof

**Files:**
- Modify: `content/docs/staff-guide.mdx` (the Water sentence in the recipe version paragraph, ~line 561, and the Water profiles paragraph ~187)
- Test: `tests/docs.test.ts`, `tests/design-docs.test.ts` (existing)

- [ ] **Step 1: Update the guide**

In the recipe version paragraph, after "**Water** (the source profile, a target profile from Water profiles, mash and sparge volumes, target mash pH, and salts or acids each with an amount, a unit and one stage: mash, sparge or kettle)" add: "; **Suggest additions** fills the salts that bring the source closest to the target over the mash and sparge water together, you can change any amount, and **Against target** shows where each of the six ions lands, warning when one is more than 20 ppm off. Until a material says which salt it is, both are shown locked." In the Water profiles paragraph replace "Nothing is calculated here: the page records a water report or a target, not the salts between them." with "Nothing is calculated here: the page records a water report or a target; the salts between them are suggested on a recipe's Water sheet."

- [ ] **Step 2: Run the full pure set, typecheck, lint, build**

Run: `bunx tsc --noEmit && bun run lint && bunx vitest run tests/water-chemistry.test.ts tests/water-view.test.ts tests/recipe-process-view.test.ts tests/mgr-screens.test.ts tests/tap-coverage.test.ts tests/screen-links.test.ts tests/theme-contrast.test.ts tests/screen-persona.test.ts tests/design-docs.test.ts tests/docs.test.ts tests/production-view.test.ts tests/app-screen-parity.test.ts tests/api-docs.test.ts && bunx next build`
Expected: all PASS, build compiles.

- [ ] **Step 3: Eyeball the Water screen**

Use the browse skill (`.agents/skills/browse/SKILL.md`) against the running dev server: open `/docs/screens-explore`, pick Water, screenshot; confirm Suggest additions and six Against target rows with Chloride warned. Then open a live draft (`/recipes/new`, log in as `dev@mgr.local`), tap the Water row, confirm both rows draw locked.

- [ ] **Step 4: Commit, push, PR**

```bash
git add content/docs/staff-guide.mdx
git commit -m "docs(water): suggestion and read-out in the staff guide

Claude-Session: https://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
git push -u origin feat/water-salt-suggestions
gh pr create --base main --title "feat(water): suggest salt additions and read out ions against target" --body "<why/what/proof; progress line; note PR B (materials.salt migration) follows on request>\n\nhttps://claude.ai/code/session_01W3iwFZVppJtk5cEvdUbnsF"
```
