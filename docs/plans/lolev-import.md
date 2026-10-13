# Lolev import — catalog and recipes (pass 1)

Status: draft, awaiting approval. Branch `feat/lolev-import`, worktree
`.agents/worktrees/feat-lolev-import`.

## Goal

Bring the Lolev Manager (Payload/MongoDB) brewing catalog and recipes into one
MGR brewery, through the existing commands, so recipes can be scheduled in MGR.
Source: the read-only production dump taken 2026-10-13
(`~/Repos/lolev-manager/db-backups/backup-2026-10-13T20-48-00-000Z/lolev-manager`).

Out of scope for pass 1 (later passes, each its own plan): batches and brew
logs (history only — Lolev never deducted ingredients, so no lot consumption
exists to import), customers, sales visits, finished goods, orders. Material
stock: none — Lolev on-hand was never decremented; MGR starts from an opening
count (`material_counts`), not a carry-over.

## Reuse (searched first)

- `upsert_material`, `upsert_water_profile`, `create_recipe`,
  `create_recipe_version` in `lib/commands/{purchasing,production}.ts`, called
  through `runCommand` (`lib/commands/registry.ts`) so zod validation, roles and
  the RPCs apply unchanged. No new SQL, migration, RPC or command.
- `import_csv` (`lib/commands/import.ts`) covers customers/SKUs/prices only; it
  is not extended (a recipe is a nested document, not a CSV row).
- `bsondump` (already installed) turns the dump into JSON lines; no new
  dependency.

## Source facts (verified against the dump)

| Lolev | Count | MGR target |
| --- | --- | --- |
| malts | 41 | material `malt`, base `lb`, extract from `yieldOnGrind` |
| hops | 140 | material `hop`, base `lb` |
| yeasts | 8 | material `yeast`, base `each` |
| sugars | 1 | material `adjunct`, base `lb`, extract from `ppg` |
| adjuncts | 1 | material `adjunct`, base `lb` |
| water salts (string names) | 5 | material `chemical`, base `g` |
| globals `water-profile` | 1 | water profile "Lolev default" |
| recipes | 169 | recipe + version 1 |

- Recipe weights are **pounds** (`Recipes.ts` placeholder "Pounds"; bags =
  recipe lb ÷ bag lb). `batchSize` is **bbl** (131 of 169 are 22).
  `perBblQty = weight_lb / batchSize`.
- Hop timing → stage: `boil`→`boil`, `whirlpool`→`whirlpool`,
  `dry-hop`→`dry_hop`; `boilTime` → `timingMinutes` for boil hops. Malts →
  `mash`; sugars → `boil`; yeast → `fermentation`, `perBblQty = 1 / batchSize`
  (one pitch per batch; ponytail: refine when MGR models pitch rate).
- Mash: 160 recipes have no schedule; MGR requires ≥1 step. Default: one
  `infusion` step at `mashTemp` (fallback 152 °F) for 60 min.
- Fermentation stage `diacetyl-rest` → `diacetyl rest`; others pass through.
- `targetAttenuation` is a percent (75) → fraction 0.75; missing → yeast's
  attenuation midpoint → 0.75. `brewhouseEfficiency` is not in Lolev: 0.75.
- Water: `useDefaultWaterProfile` → the default profile id; a non-zero
  `sourceWaterProfile` → its own profile "<recipe> source". Additions (all g,
  all mash) → `water.additions`.
- Duplicate names (Costilla, Kamo, Edo II, Lupula V, Priam): the newer one
  keeps the name, older gets " (YYYY-MM-DD)" suffixed with its created date.
- A recipe with no resolvable ingredient is skipped and reported, never
  imported empty (`create_recipe_version` requires ≥1 ingredient).

## Tasks

1. **Mapping module** — `lib/import/lolev.ts` (pure, no I/O):
   `mapMaterials(catalogs)`, `mapRecipe(doc, refs, defaults)`, returning MGR
   command inputs plus a `skipped` reason list. Types: `LolevRecipe`,
   `LolevCatalog`, `MgrRecipeImport`.
   Test first: `tests/lolev-import.test.ts` — units (lb/bbl → per bbl),
   hop-stage mapping, default mash step, `diacetyl-rest`, attenuation percent →
   fraction, duplicate-name suffix, empty recipe skipped, water default vs
   custom. Pure, no DB. Accept: `bunx vitest run tests/lolev-import.test.ts`,
   `bunx tsc --noEmit`. Depends: none.
2. **Runner script** — `scripts/import-lolev.ts <dump-dir> --brewery <id>
   [--dry-run]`: `bsondump` each collection, run the mapper, then
   `runCommand` in order materials → water profiles → recipes → versions,
   skipping any material/profile/recipe whose name already exists in the
   brewery (idempotent by name). `--dry-run` prints counts and the skip list
   and writes nothing. Test: covered by task 3. Depends: 1.
3. **DB test on `mgr_test`** — `tests/lolev-import-db.test.ts`: import a
   three-recipe fixture (inline synthetic JSON, not the real dump) into a test
   brewery; assert materials, recipe versions, per-bbl quantities, water
   additions; run twice and assert no duplicates. Accept: `scripts/test-db.sh`
   then the test. Depends: 2.
4. **Run locally** — dry run, then a real run against the local dev stack
   brewery; spot-check three recipes in `/recipes` with the browse skill.
   Report counts and skips. Depends: 3. (Hosted Supabase: ask first,
   separately.)
5. **Docs** — module comments; a "Importing from Lolev Manager" section in
   `README.md` (how to run, what is and is not imported). No customer-visible
   behavior changes, so the PR body carries `DOCS: none` and `API: none`.

Parallelism: 1 → 2 → 3 → 4 are sequential; 5 can run alongside 3.

## Open questions (defaults chosen; say if wrong)

- Brewhouse efficiency 0.75 for every recipe.
- Yeast as one pitch per batch.
- Malt `yieldOnGrind` 80 → extract potential `1 + 0.046 × 0.80` (≈1.037,
  sucrose 46 PPG × yield).
