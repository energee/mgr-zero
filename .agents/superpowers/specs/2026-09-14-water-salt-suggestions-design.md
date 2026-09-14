# Water salt suggestions — design

Decided 2026-09-14. The Water screen of a recipe version suggests brewing-salt
additions that bring the source water closest to the target profile, lets the
brewer adjust them, and shows where every ion lands against target. Source of
truth for the screen: `components/mgr/screens.tsx` (Water record).

## Scope

- One pure calculation module in the registry layer, used by the editor
  preview and by any server read. Nothing computed is stored.
- The Water screen gains a Suggest additions verb and a six-ion read-out.
- Materials gain an optional `salt` identity so the calculation knows which
  chemistry a material carries. This is a schema change and is gated: the
  screen, the calculation and its tests ship first; the live sheet draws the
  verb and read-out gated until the migration and command changes land.

Out of scope: mash pH prediction, acids (they stay hand-entered and are left
alone by the solver), kettle-only targets, per-stage targets.

## Data

`materials.salt text null check (salt in ('gypsum','calcium_chloride',
'epsom_salt','baking_soda','chalk','table_salt','magnesium_chloride'))`.
The Material sheet gets a "Salt · optional" pick with those seven labels;
`create_material`/`update_material` accept `salt`; `list_materials` returns it.
Migration file `supabase/migrations/<stamp>_material_salt.sql`, then
`bun run migrations:lock`. Until it lands: `SCHEMA-GATE` on the live sheet's
verb and read-out (drawn with `E.gated`), never on the Water record's `writes`.

## Calculation (`lib/water-chemistry.ts`, pure)

Ion table, ppm per gram per liter of water. One place; correct it here only.

| salt | Ca | Mg | Na | SO4 | Cl | HCO3 |
| --- | --- | --- | --- | --- | --- | --- |
| gypsum (CaSO4·2H2O) | 232.8 | | | 557.7 | | |
| calcium chloride (CaCl2·2H2O) | 272.6 | | | | 482.3 | |
| Epsom salt (MgSO4·7H2O) | | 98.6 | | 389.6 | | |
| baking soda (NaHCO3) | | | 273.7 | | | 726.3 |
| chalk (CaCO3) | 400.5 | | | | | 1219.7 |
| table salt (NaCl) | | | 393.4 | | 606.6 | |
| magnesium chloride (MgCl2·6H2O) | | 119.5 | | | 348.7 | |

Volume basis: total brewing water = mash gal + sparge gal, in liters. Every
addition, whatever its stage (mash, sparge, kettle), contributes to that one
total. Units: grams as entered; `oz` × 28.3495; `mL` is treated as grams
(acids, which the solver ignores anyway).

```ts
type Ions = { calcium: number; magnesium: number; sodium: number; sulfate: number; chloride: number; bicarbonate: number };
type Salt = "gypsum" | "calcium_chloride" | "epsom_salt" | "baking_soda" | "chalk" | "table_salt" | "magnesium_chloride";

waterChemistry(input: { source: Ions; target?: Ions; mashGal: number; spargeGal: number;
  additions: { salt: Salt | null; grams: number }[] }): { ion: keyof Ions; source: number; added: number; result: number; target?: number; delta?: number }[]

suggestSalts(input: { source: Ions; target: Ions; totalGal: number; salts: Salt[] }): { salt: Salt; grams: number }[]
```

`suggestSalts` minimizes Σ(result − target)² over the six ions with grams ≥ 0,
using only the salts passed (the ones the brewery stocks as materials with a
`salt`). Projected gradient descent with a fixed iteration cap is enough at
this size; no dependency. Results round to 0.1 g and drop zeros. The caller
splits each salt into a mash and a sparge addition by volume ratio; a salt
that rounds to 0 in either stage is added to the other.

Both functions throw on negative volumes and return an empty read-out when
total water is 0.

## Screen (Water)

Below the additions list:

- `E.btn("Suggest additions", "g")`, disabled when there is no target
  profile or the total water is 0. On tap it replaces the salt additions
  (materials with a `salt`) with the solver's mash/sparge split and leaves
  every other addition (acids, unknown materials) in place.
- Six rows, one per ion, in profile order: title "Sulfate", detail
  "180 of 200 ppm · −20"; class `w` when |delta| > 20 ppm. Absent when no
  target is picked. Recomputed on every edit of an addition or a volume.
- Spec text on the record replaces "ion deltas … are calculations this slice
  does not build" with the shared-formula rule: the preview and the server
  call `waterChemistry`.

Fixture: Municipal Denver → Hazy target, three salts stocked, additions
trimmed by hand so Calcium and Chloride warn; Bicarbonate warns too, since
salts only add ions and Denver starts 70 ppm over the target.

## Live binding

`WaterSheet` (recipes/[id]/schedule-sheets.tsx) passes each material's
`salt` (from `list_materials`) into the shared `WaterView`; the view holds the
read-out and the verb. Until `materials.salt` exists the view receives no
salts and draws `E.gated("Suggest additions", …)` and
`E.gated("Ion read-out", …)` in their places. Nothing invents a salt from a
material's name.

The brewery's default source water is a Settings value; PR B passes it
through `sourceDefault` so a version that does not override its source still
gets the verb and the read-out.

## Testing

- `tests/water-chemistry.test.ts`: 1 g gypsum in 10 L adds 23.28 ppm Ca and
  55.77 ppm SO4; a hand-worked two-salt case reproduces its grams within
  0.1 g; the solver never returns negatives; zero water yields an empty
  read-out; `oz` converts.
- `tests/mgr-screens.test.ts` additions: the Water record shows the verb and
  the six ions; the warning row carries `w`.
- `tests/recipe-process-view.test.ts`: the mash/sparge split and the
  "replace only salts" merge.
- Source test: `WaterSheet` mounts `WaterView` with salts from materials and
  draws no read-out of its own.

## Delivery

Two PRs. PR A: calculation, screen, fixture, view, live gated, docs
(`staff-guide.mdx` Water paragraph). PR B, on request: migration, lock,
Material sheet Salt pick, command changes, gate lifted, API docs regenerated.
