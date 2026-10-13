// TEMPORARY: one-off Lolev migration code. Delete with the rest of the import once the migration is done (#867).
// tests/lolev-import-db.test.ts — scripts/import-lolev.ts against the test
// database: a synthetic Lolev dump goes through the real commands, lands as
// materials, water profiles, recipes and version-1 ingredients with per-bbl
// quantities, and a second run writes nothing.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { importLolev, type LolevDump } from "@/scripts/import-lolev";
import { DEFAULT_PROFILE_NAME, SALT_NAMES } from "@/lib/import/lolev";
import "@/lib/commands/all";

const dump: LolevDump = {
  defaultIons: { globalType: "water-profile", name: "Default", calcium: 27, magnesium: 6, sodium: 25, sulfate: 12, chloride: 36, bicarbonate: 63, pH: 7 },
  malts: [{ _id: "m1", name: "Test Pale", yieldOnGrind: 80 }],
  hops: [{ _id: "h1", name: "Test Hop" }, { _id: "h2", name: "Test Hop " }],
  yeasts: [{ _id: "y1", name: "Test Ale", attenuation: { low: 70, high: 80 } }],
  sugars: [], adjuncts: [],
  recipes: [
    {
      _id: "r1", name: "Test IPA", createdAt: "2025-01-01T00:00:00.000Z", batchSize: 20, boilTime: 60, targetAttenuation: 78,
      malts: [{ malt: "m1", weight: 1000 }], hops: [{ hop: "h1", weight: 10, hopTiming: "boil", boilTime: 60 }, { hop: "h2", weight: 40, hopTiming: "dry-hop" }],
      yeast: "y1", useDefaultWaterProfile: true,
      waterAdditions: [{ mineral: "gypsum", amount: 400, unit: "g", target: "mash" }],
    },
    {
      _id: "r2", name: "Test Lager", createdAt: "2025-02-01T00:00:00.000Z", batchSize: 10, boilTime: 60,
      malts: [{ malt: "m1", weight: 400 }], yeast: "y1",
      sourceWaterProfile: { calcium: 10, magnesium: 2, sodium: 5, sulfate: 8, chloride: 9, bicarbonate: 20 },
      fermentationSchedule: [{ stage: "primary", temperature: 50, duration: 14 }, { stage: "diacetyl-rest", temperature: 60, duration: 2 }],
    },
  ],
};

let breweryId: string;
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let first: Awaited<ReturnType<typeof importLolev>>;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId, "brewer");
  first = await importLolev(dump, ctx);
});

const rows = async (table: "materials" | "water_profiles" | "recipes") => {
  const { data, error } = await admin.from(table).select("id, name").eq("brewery_id", breweryId).order("name");
  if (error) throw error;
  return data;
};

describe("importLolev", () => {
  it("creates one material per trimmed name plus the five salts", async () => {
    const names = (await rows("materials")).map((m) => m.name).sort();
    expect(names).toEqual(["Test Ale", "Test Hop", "Test Pale", ...Object.values(SALT_NAMES)].sort());
    expect(first.created).toMatchObject({ materials: 8, recipes: 2, skippedExisting: 0 });
  });

  it("creates the default profile and one source profile for the custom recipe", async () => {
    expect((await rows("water_profiles")).map((p) => p.name).sort()).toEqual([DEFAULT_PROFILE_NAME, "Test Lager source water"].sort());
  });

  it("writes version 1 with per-bbl ingredients and the water addition", async () => {
    const { data: v, error } = await admin.from("recipe_versions")
      .select("version, yeast_attenuation, recipes!inner(name), recipe_ingredients(per_bbl_qty, stage, timing_minutes, materials(name)), recipe_water_additions(qty, unit, stage, materials(name))")
      .eq("brewery_id", breweryId).eq("recipes.name", "Test IPA").single();
    if (error) throw error;
    expect(v.version).toBe(1);
    expect(Number(v.yeast_attenuation)).toBeCloseTo(0.78);
    const lines = v.recipe_ingredients.map((l) => [l.materials!.name, l.stage, Number(l.per_bbl_qty), l.timing_minutes]);
    expect(lines).toEqual(expect.arrayContaining([
      ["Test Pale", "mash", 50, null], ["Test Hop", "boil", 0.5, 60], ["Test Hop", "dry_hop", 2, null], ["Test Ale", "fermentation", 0.05, null],
    ]));
    expect(v.recipe_water_additions.map((a) => [a.materials!.name, Number(a.qty), a.unit, a.stage])).toEqual([[SALT_NAMES.gypsum, 400, "g", "mash"]]);
  });

  it("writes nothing on a second run", async () => {
    const before = await Promise.all([rows("materials"), rows("water_profiles"), rows("recipes")]);
    const again = await importLolev(dump, ctx);
    expect(again.created).toMatchObject({ materials: 0, waterProfiles: 0, recipes: 0 });
    expect(await Promise.all([rows("materials"), rows("water_profiles"), rows("recipes")])).toEqual(before);
  });
});
