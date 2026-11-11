# Recipe color (SRM)

Status: Phase 1 plan, awaiting approval. It comes after the three PRs in
`docs/plans/recipe-run-sheet.md`, which give the sheet its batch size and new
layout. Its branch `feat/recipe-srm` is cut from `main` once they land. PR to
`main`.

## Why

The recipe sheet heads with OG, FG, ABV and IBU. Color is the missing figure.
Nothing in the app holds malt color today, so it cannot be calculated yet.

## What the brewer sees

- **Materials.** A malt or fermentable adjunct takes **Color °L · optional**,
  copied from the sack or the spec sheet. It sits beside Extract potential and
  shows for the same kinds of material.
- **Recipe sheet.** A fifth figure, **SRM**, to one decimal, beside IBU.
- **Missing color.** If any counted line has no color, there is no SRM figure.
  A line under the figures names the materials: *SRM not estimated: no color:
  Pilsner, Oats; set Color under Materials, then Refresh from Materials on the
  current recipe.* A color is never assumed.
- **Refresh from Materials** already compares the figures as printed, so it
  offers a refresh when a newly typed color would give an SRM.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Stored unit | °Lovibond on the material | It is what US sacks print and what the formula takes. SRM describes the beer, not the malt. |
| EBC | Not stored. The guide gives the conversion: °L ≈ (EBC + 1.2) ÷ 2.65 | One unit, no picker. |
| Per lot or per material | Per material | Color moves little between lots. |
| Bounds | 0 to 600 | 0 is a real answer for rice hulls. 600 covers roasted barley. |
| Formula | Morey: MCU = Σ(lb per bbl × °L) ÷ 31; SRM = 1.4922 × MCU^0.6859 | The standard estimate. Per barrel is post-boil, as gravity is. |
| Which lines count | The lines that count toward gravity: mash-stage lines | One rule for both figures. |
| Missing data | No figure and a named gap. No lower bound, no default | v1 assumed 2 °L and looked precise while wrong. |
| Where it is computed | One pure function, `lib/recipe-srm.ts`, used by `get_recipe` and the live preview | v1 kept a second SQL copy that drifted. |
| Stored result | None. SRM is computed on read | Same as OG and IBU. |
| Freezing | `recipe_ingredients.color_snapshot`, written at save | A material edit must not move a saved copy. |

Goldens for the tests:

| Grain bill per bbl | MCU | SRM |
|---|---|---|
| 44 lb at 2 °L | 2.8387 | 3.05 |
| 44 lb at 2 °L and 4 lb at 60 °L | 10.5806 | 7.53 |

## Migration

File: `supabase/migrations/<UTC timestamp at build>_recipe_color.sql`, later
than every migration on `main`.

```sql
alter table public.materials
  add column color_lovibond numeric(6,2) check (color_lovibond >= 0 and color_lovibond <= 600); -- °L, as on the sack
alter table public.recipe_ingredients
  add column color_snapshot numeric(6,2); -- materials.color_lovibond when the copy was saved
```

Function bodies are copied from their latest definitions at build time, never
from this plan:

| Function | Latest definition today | Change |
|---|---|---|
| `public.create_recipe_version` | `20261105041048_recipe_alpha_acid.sql` | Same signature. The ingredient insert also writes `m.color_lovibond` to `color_snapshot`. |
| `public.upsert_material` | `20261105041048_recipe_alpha_acid.sql` | New `p_color_lovibond`, so drop the old signature and re-grant. An omitted value keeps the saved one. |

Merging deploys production and pushes the migration to hosted. That step is
ask-first.

## Tasks

Each task names its test first and starts by watching it fail. UI rendering is
checked in a browser. Order: 1, then 2 and 3 in parallel, then 4 and 5 in
parallel, then 6 and 7.

1. **Migration, lock, types.** Test first: pin the new signature in
   `tests/rpc-allowlist.test.ts`; update the arity in
   `tests/rls-taproom.test.ts`. Run `MGR_TEST_DB_RESET=1 scripts/test-db.sh`,
   `bun run types:database`, `bun run migrations:lock`. Accept:
   `migrations-applied`, `rpc-allowlist`, `rls-taproom`, tsc.

2. **Commands.** Test first: `tests/purchasing.test.ts` (color saves, an edit
   that omits it keeps it, 0 saves, 601 is refused), `tests/production.test.ts`
   (color freezes on a copy; `get_recipe` returns `srm`).
   - Files: `lib/commands/purchasing.ts`, `lib/commands/production.ts`.
   - Types: `colorLovibond: z.number().min(0).max(600).optional()`.
   - Accept: vitest on `mgr_test`, tsc.

3. **`recipeSrm`.** Test first: `tests/recipe-srm.test.ts` (both goldens; oz,
   kg and g match lb; a boil or dry-hop line adds nothing; 0 °L adds nothing
   and is not a gap; a mash line with no color is a gap; a mash line stocked
   in a unit with no weight is a gap; no mash line gives no figure).
   - Files: `lib/recipe-srm.ts` (new). It reuses `LB_PER` from
     `lib/recipe-gravity.ts` and `GALLONS_PER_BBL` from `lib/volume.ts`.
   - Types: `RecipeSrm = { kind: "estimate"; srm: number } | { kind: "gaps";
     gaps: { name: string; reason: string }[] } | { kind: "none" }`;
     `recipeSrm(lines): RecipeSrm`; `srmText(result, { saved }): string | undefined`.
   - Accept: vitest, tsc.

4. **Recipe sheet.** Test first: `tests/recipe-view.test.ts`,
   `tests/mgr-screens.test.ts`.
   - `RecipeFigures` gains `srm`. `figureStrip` adds the SRM figure and its
     gap line. `materialsNowGive` counts color gaps as it counts hop gaps.
   - The editor's live preview reads each material's current color.
   - The fixture's SRM is computed, never typed.
   - Files: `lib/mgr/recipe-view.ts`, `lib/mgr/recipe-process-view.ts`
     (`RecipeMaterial` carries the color),
     `app/(app)/recipes/[id]/recipe-version-form.tsx`,
     `app/(app)/recipes/[id]/page.tsx`, `lib/mgr/fixtures/production.ts`,
     `components/mgr/screens.tsx`.
   - Accept: vitest, the screen proof list, browse a recipe with colors set.

5. **Material sheet.** Test first: `tests/purchasing-view.test.ts` (Color on
   the kinds that take Extract potential, and on no other).
   - Files: `lib/mgr/material-view.ts`, `components/mgr/views/material.tsx`,
     `app/(app)/materials/material-form.tsx`, `lib/mgr/fixtures/purchasing.ts`.
   - Accept: the screen proof list, browse `/materials`.

6. **Docs.** Staff guide: the Color field under Materials, the SRM figure and
   its gap line under Recipes, the EBC conversion, and that fruit and
   late-added sugars do not count. `bun run docs:api` for `upsert_material`
   and `get_recipe`. Tests: `tests/docs.test.ts`, `tests/api-docs.test.ts`.

7. **Proof and review.** `bunx tsc --noEmit`, `bun run lint`, the complete
   `bun run test`, the browser at 1280 and 390, `/simplify`, the Haiku check,
   and a read-only review before the push.

## Not in this PR

- No color swatch beside the figure.
- No EBC entry or unit picker.
- No per-lot color.
- No change to which lines count toward gravity.

## Open questions for the owner

1. **Existing recipes.** All 169 imported recipes will read "SRM not
   estimated" until their malts have a color and each recipe is refreshed. A
   one-time local data fill could write the color onto saved copies that have
   none, as was planned for alpha acid. Do you want that fill, and per
   database?
2. **Lolev's color data.** The old Lolev data has both a `color` and an `srm`
   field on malts, and nobody recorded which unit `color` holds. Should the
   fill use it once the unit is confirmed, or do you type the colors yourself?
   There are a few dozen malts.
3. **What does not count.** Only mash-stage lines count, as for gravity. Fruit,
   and dark sugar or syrup added in the kettle, add no color. The guide will
   say so. Is that acceptable for now?
4. **Swatch.** Do you want a small color swatch beside the SRM figure later?

## The PR after this one: figures the sheet can already derive

Owner approved all four on 2026-11-10. It gets its own plan when SRM lands.

- **Grist percentages:** each malt's share of the grain bill, and total grain
  per barrel.
- **BU:GU:** bitterness against gravity, shown once IBU has a value.
- **IBU per hop addition:** each boil and whirlpool line's share of the total.
- **Cost per barrel:** `get_brand_recipe_cost` computes this for a brand today.
  The recipe page needs it for a recipe, which may mean a query change, so
  that PR may not be screen-only.
