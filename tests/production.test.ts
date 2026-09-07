// tests/production.test.ts — recipes and their immutable versions: a version
// snapshots materials.extract_potential onto every ingredient, so editing the
// material later never moves an old version's predicted gravity. get_recipe
// computes OG/FG/ABV in TypeScript (lib/recipe-gravity.ts), never in SQL.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import { recipeGravity } from "@/lib/recipe-gravity";
import "@/lib/commands/all";

let b: { id: string };
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let malt: string;
let hop: string;

// A malt with a typed extract potential and a hop without one: the hop proves
// the boil stage is excluded from gravity and that a null potential is tolerated.
async function seedMaterial(name: string, category: string, extractPotential: number | null) {
  const { data, error } = await admin.from("materials").insert({
    brewery_id: b.id, name, category, base_uom: "lb", purchase_uom: "lb", extract_potential: extractPotential,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "brewer");
  malt = await seedMaterial("Pale Ale Malt", "malt", 1.037);
  hop = await seedMaterial("Citra", "hop", null);
});

describe("recipes and immutable versions", () => {
  it("creates a recipe, then two versions whose ingredients snapshot extract potential", async () => {
    const recipe = (await runCommand("create_recipe", { name: "Flagship IPA", note: "house pale" }, ctx)) as { id: string };
    expect(recipe.id).toBeTruthy();

    const v1 = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78, boilMinutes: 60,
      ingredients: [
        { materialId: malt, perBblQty: 60, stage: "mash" },
        { materialId: hop, perBblQty: 1.5, stage: "boil", timingMinutes: 60 },
      ],
    }, ctx)) as { id: string; version: number };
    expect(v1.version).toBe(1);

    // The malt's potential changes after v1 is saved; v1 must not follow it.
    await admin.from("materials").update({ extract_potential: 1.02 }).eq("id", malt);

    const v2 = (await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8,
      ingredients: [{ materialId: malt, perBblQty: 70, stage: "mash" }],
    }, ctx)) as { id: string; version: number };
    expect(v2.version).toBe(2);

    const v1Rows = await admin.from("recipe_ingredients")
      .select("material_id, per_bbl_qty, stage, extract_snapshot").eq("recipe_version_id", v1.id).order("sort");
    expect(v1Rows.data).toEqual([
      { material_id: malt, per_bbl_qty: 60, stage: "mash", extract_snapshot: 1.037 },
      { material_id: hop, per_bbl_qty: 1.5, stage: "boil", extract_snapshot: null },
    ]);

    const v2Rows = await admin.from("recipe_ingredients").select("extract_snapshot").eq("recipe_version_id", v2.id);
    expect(v2Rows.data).toEqual([{ extract_snapshot: 1.02 }]);

    // get_recipe answers with the latest version and the gravity that
    // recipeGravity predicts from exactly those snapshots.
    const got = (await runCommand("get_recipe", { recipeId: recipe.id }, ctx)) as {
      recipe: { id: string; name: string };
      version: { id: string; version: number };
      ingredients: { material_id: string; extract_snapshot: number | null }[];
      ogPlato: number; fgPlato: number; abv: number;
    };
    expect(got.recipe).toMatchObject({ id: recipe.id, name: "Flagship IPA" });
    expect(got.version).toMatchObject({ id: v2.id, version: 2 });
    const expected = recipeGravity({
      mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8,
      ingredients: [{ perBblQty: 70, extractPotential: 1.02, stage: "mash" }],
    });
    expect({ ogPlato: got.ogPlato, fgPlato: got.fgPlato, abv: got.abv }).toEqual(expected);

    const listed = (await runCommand("list_recipes", {}, ctx)) as { id: string }[];
    expect(listed.map((r) => r.id)).toContain(recipe.id);
  });

  it("refuses an efficiency or attenuation outside (0,1]", async () => {
    const recipe = (await runCommand("create_recipe", { name: "Fraction check" }, ctx)) as { id: string };
    const bad = (v: Record<string, number>) => runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      ingredients: [{ materialId: malt, perBblQty: 60, stage: "mash" }], ...v,
    }, ctx);
    await expect(bad({ brewhouseEfficiency: 75 })).rejects.toThrow(/validation failed/);
    await expect(bad({ yeastAttenuation: 0 })).rejects.toThrow(/validation failed/);
  });

  it("keeps targets off recipe_versions: gravity is predicted, never stored", () => {
    expect(sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='recipe_versions'
        and column_name in ('target_og_plato','target_fg_plato','target_abv') order by 1`)).toEqual([]);
  });
});

// Vessels, scheduling and the brew day. A batch is scheduled before it is
// brewed and may carry no brand: identity is only required at packaging
// (§16.9). `record_brew_day` is the one call that stamps brewed_on and opens
// the vessel occupancy, so a batch can never be brewed into nowhere.
describe("vessels, scheduling and brew day", () => {
  let fv: string;

  it("creates and renames a vessel, and lists it", async () => {
    const v = (await runCommand("upsert_vessel", { name: "FV1", kind: "fermenter", capacityBbl: 30 }, ctx)) as { id: string };
    expect(v.id).toBeTruthy();
    fv = v.id;

    const renamed = (await runCommand("upsert_vessel",
      { id: fv, name: "FV-1", kind: "fermenter", capacityBbl: 31 }, ctx)) as { id: string; name: string; capacity_bbl: number };
    expect(renamed).toMatchObject({ id: fv, name: "FV-1", capacity_bbl: 31 });

    const listed = (await runCommand("list_vessels", {}, ctx)) as { id: string; name: string }[];
    expect(listed.filter((r) => r.id === fv)).toEqual([expect.objectContaining({ name: "FV-1" })]);
  });

  it("schedules a batch with no brand, brews it into the fermenter, and refuses a second brew there", async () => {
    const batch = (await runCommand("schedule_batch",
      { plannedOn: "2026-10-01", plannedBbl: 30, note: "no brand yet" }, ctx)) as { id: string; intended_brand_id: string | null };
    expect(batch.intended_brand_id).toBeNull();

    const listed = (await runCommand("list_batches", {}, ctx)) as {
      id: string; brand_name: string | null; recipe_name: string | null;
      planned_on: string; brewed_on: string | null; vessel_name: string | null;
    }[];
    expect(listed.find((r) => r.id === batch.id))
      .toMatchObject({ brand_name: null, recipe_name: null, planned_on: "2026-10-01", brewed_on: null, vessel_name: null });

    await runCommand("record_brew_day", { batchId: batch.id, vesselId: fv, initialBbl: 29.5, brewedOn: "2026-10-01" }, ctx);

    const day = (await runCommand("get_brew_day", { batchId: batch.id }, ctx)) as {
      batch: { id: string; brewed_on: string };
      occupancy: { id: string; initial_bbl: number; vessel_name: string } | null;
    };
    expect(day.batch).toMatchObject({ id: batch.id, brewed_on: "2026-10-01" });
    expect(day.occupancy).toMatchObject({ initial_bbl: 29.5, vessel_name: "FV-1" });

    // The same batch cannot be brewed twice.
    await expect(runCommand("record_brew_day",
      { batchId: batch.id, vesselId: fv, initialBbl: 10, brewedOn: "2026-10-02" }, ctx)).rejects.toThrow(/already brewed/);

    // Nor can a second batch move into a vessel whose occupancy is still open.
    const second = (await runCommand("schedule_batch", { plannedOn: "2026-10-02", plannedBbl: 30 }, ctx)) as { id: string };
    await expect(runCommand("record_brew_day",
      { batchId: second.id, vesselId: fv, initialBbl: 30, brewedOn: "2026-10-02" }, ctx)).rejects.toThrow(/occupied/);

    // list_batches shows the open vessel on the brewed batch.
    const after = (await runCommand("list_batches", {}, ctx)) as { id: string; vessel_name: string | null }[];
    expect(after.find((r) => r.id === batch.id)?.vessel_name).toBe("FV-1");
  });
});

// A backdated brew day is the case `ended_at is null` misses: the vessel is
// empty *now*, but the day being recorded falls inside a stretch it was full.
// The pre-check uses the same range predicate as the gist exclusion, so this
// reports `occupied` rather than dying on the raw constraint name.
describe("brew day overlaps a closed occupancy", () => {
  it("refuses a backdated brew inside a closed stretch, and allows one after it", async () => {
    const vessel = (await runCommand("upsert_vessel", { name: "FV-BACKDATE", kind: "fermenter", capacityBbl: 30 }, ctx)) as { id: string };
    const first = (await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 30 }, ctx)) as { id: string };
    await runCommand("record_brew_day", { batchId: first.id, vesselId: vessel.id, initialBbl: 30, brewedOn: "2026-10-01" }, ctx);

    // No close RPC exists yet (that is the cellar-transfer task), so end the
    // occupancy directly: the vessel is empty from 10-05 on.
    sql(`update vessel_occupancies set ended_at = timestamptz '2026-10-05'
         where batch_id = '${first.id}' and ended_at is null`, true);

    const backdated = (await runCommand("schedule_batch", { plannedOn: "2026-10-03", plannedBbl: 30 }, ctx)) as { id: string };
    await expect(runCommand("record_brew_day",
      { batchId: backdated.id, vesselId: vessel.id, initialBbl: 30, brewedOn: "2026-10-03" }, ctx))
      .rejects.toThrow(/occupied/);

    // A brew day after the stretch closed is fine, and leaves brewed_on unset
    // on the batch that was refused above.
    await runCommand("record_brew_day", { batchId: backdated.id, vesselId: vessel.id, initialBbl: 28, brewedOn: "2026-10-06" }, ctx);
    const day = (await runCommand("get_brew_day", { batchId: backdated.id }, ctx)) as {
      batch: { brewed_on: string }; occupancy: { initial_bbl: number } | null;
    };
    expect(day.batch.brewed_on).toBe("2026-10-06");
    expect(day.occupancy).toMatchObject({ initial_bbl: 28 });
  });
});

// Tenancy and roles. Every id these RPCs accept is matched against p_brewery,
// so another brewery's vessel, brand, recipe version or batch reads as missing
// rather than leaking that it exists.
describe("vessels and batches refuse other tenants and other roles", () => {
  let other: { id: string };
  let otherCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
  let otherVessel: string;
  let otherBrand: string;
  let otherRecipeVersion: string;
  let otherBatch: string;

  beforeAll(async () => {
    other = await makeBrewery();
    otherCtx = await makeStaffCtx(other.id, "brewer");
    otherVessel = ((await runCommand("upsert_vessel", { name: "Their FV", kind: "fermenter", capacityBbl: 20 }, otherCtx)) as { id: string }).id;
    otherBrand = (await seedCatalog(other.id)).brandId;
    otherBatch = ((await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 20 }, otherCtx)) as { id: string }).id;

    const { data: m, error } = await admin.from("materials").insert({
      brewery_id: other.id, name: "Their Malt", category: "malt", base_uom: "lb", purchase_uom: "lb", extract_potential: 1.037,
    }).select("id").single();
    if (error) throw error;
    const recipe = (await runCommand("create_recipe", { name: "Their Recipe" }, otherCtx)) as { id: string };
    otherRecipeVersion = ((await runCommand("create_recipe_version", {
      recipeId: recipe.id, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      ingredients: [{ materialId: m.id as string, perBblQty: 60, stage: "mash" }],
    }, otherCtx)) as { id: string }).id;
  });

  it("refuses another brewery's vessel, brand, recipe version and batch", async () => {
    await expect(runCommand("upsert_vessel",
      { id: otherVessel, name: "Stolen", kind: "fermenter", capacityBbl: 20 }, ctx)).rejects.toThrow(/vessel not found/);

    await expect(runCommand("schedule_batch",
      { intendedBrandId: otherBrand, plannedOn: "2026-10-01", plannedBbl: 10 }, ctx)).rejects.toThrow(/brand not found/);
    await expect(runCommand("schedule_batch",
      { recipeVersionId: otherRecipeVersion, plannedOn: "2026-10-01", plannedBbl: 10 }, ctx)).rejects.toThrow(/recipe version not found/);

    const mine = (await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10 }, ctx)) as { id: string };
    await expect(runCommand("record_brew_day",
      { batchId: mine.id, vesselId: otherVessel, initialBbl: 10, brewedOn: "2026-10-01" }, ctx)).rejects.toThrow(/vessel not found/);

    const myVessel = (await runCommand("upsert_vessel", { name: "FV-TENANCY", kind: "fermenter", capacityBbl: 20 }, ctx)) as { id: string };
    await expect(runCommand("record_brew_day",
      { batchId: otherBatch, vesselId: myVessel.id, initialBbl: 10, brewedOn: "2026-10-01" }, ctx)).rejects.toThrow(/batch not found/);

    // Neither brewery's rows moved: the other batch is still unbrewed.
    const theirs = (await runCommand("get_brew_day", { batchId: otherBatch }, otherCtx)) as { batch: { brewed_on: string | null } };
    expect(theirs.batch.brewed_on).toBeNull();
  });

  it("refuses sales, which is neither admin nor brewer", async () => {
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("upsert_vessel", { name: "Sales FV", kind: "fermenter", capacityBbl: 10 }, sales))
      .rejects.toThrow(/permission denied/);
    await expect(runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10 }, sales))
      .rejects.toThrow(/permission denied/);
    await expect(runCommand("record_brew_day",
      { batchId: crypto.randomUUID(), vesselId: crypto.randomUUID(), initialBbl: 10, brewedOn: "2026-10-01" }, sales))
      .rejects.toThrow(/permission denied/);
    await expect(runCommand("list_batches", {}, sales)).rejects.toThrow(/permission denied/);
  });
});

// ------------------------------------------------------------ cellar transfers
// The cellar has no "volume" column: occupancy_volumes derives what is in a
// vessel from initial_bbl plus transfers in, minus transfers out and their
// loss. record_cellar_transfer must therefore come out right through the view,
// and close the source only when the view says it is empty.
describe("cellar transfers", () => {
  const volume = async (occupancyId: string) => {
    const { data, error } = await admin.from("occupancy_volumes").select("bbl").eq("occupancy_id", occupancyId).single();
    if (error) throw error;
    return Number(data.bbl);
  };
  const occupancyRow = async (occupancyId: string) => {
    const { data, error } = await admin.from("vessel_occupancies")
      .select("id, batch_id, vessel_id, ended_at").eq("id", occupancyId).single();
    if (error) throw error;
    return data as { id: string; batch_id: string; vessel_id: string; ended_at: string | null };
  };

  // A brewed batch sitting in its own fermenter, ready to be moved.
  async function brew(name: string, bbl: number, brewedOn: string) {
    const vessel = (await runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 30 }, ctx)) as { id: string };
    const batch = (await runCommand("schedule_batch", { plannedOn: brewedOn, plannedBbl: bbl }, ctx)) as { id: string };
    const day = (await runCommand("record_brew_day",
      { batchId: batch.id, vesselId: vessel.id, initialBbl: bbl, brewedOn }, ctx)) as { occupancy: { id: string } };
    return { vesselId: vessel.id, batchId: batch.id, occupancyId: day.occupancy.id };
  }

  it("moves part of a batch into an empty vessel, then closes the source when it empties", async () => {
    const source = await brew("XFER-FV1", 10, "2026-11-01");
    const brite = (await runCommand("upsert_vessel", { name: "XFER-BR1", kind: "brite", capacityBbl: 30 }, ctx)) as { id: string };

    const first = (await runCommand("record_cellar_transfer",
      { fromOccupancyId: source.occupancyId, toVesselId: brite.id, volumeBbl: 5 }, ctx)) as {
        transfer: { bbl: number; loss_bbl: number }; to_occupancy: { id: string; batch_id: string }; from_occupancy: { ended_at: string | null };
      };
    expect(Number(first.transfer.bbl)).toBe(5);
    // Filled by transfer, so the new occupancy opens at zero and carries the source's batch.
    expect(first.to_occupancy.batch_id).toBe(source.batchId);
    expect(first.from_occupancy.ended_at).toBeNull();
    expect(await volume(source.occupancyId)).toBe(5);
    expect(await volume(first.to_occupancy.id)).toBe(5);

    // The rest, with a bit of cellar loss: the source is now empty and closes.
    const second = (await runCommand("record_cellar_transfer",
      { fromOccupancyId: source.occupancyId, toVesselId: brite.id, volumeBbl: 4.5, lossBbl: 0.5 }, ctx)) as {
        to_occupancy: { id: string }; from_occupancy: { ended_at: string | null };
      };
    expect(second.to_occupancy.id).toBe(first.to_occupancy.id);
    expect(second.from_occupancy.ended_at).not.toBeNull();
    expect(await volume(source.occupancyId)).toBe(0);
    expect(await volume(first.to_occupancy.id)).toBe(9.5);
    expect((await occupancyRow(source.occupancyId)).ended_at).not.toBeNull();
  });

  it("blends into an occupied vessel, leaving the target's batch identity alone", async () => {
    const host = await brew("BLEND-FV1", 6, "2026-11-02");
    const donor = await brew("BLEND-FV2", 4, "2026-11-02");

    const blended = (await runCommand("record_cellar_transfer",
      { fromOccupancyId: donor.occupancyId, toVesselId: host.vesselId, volumeBbl: 4 }, ctx)) as {
        to_occupancy: { id: string; batch_id: string };
      };
    expect(blended.to_occupancy.id).toBe(host.occupancyId);
    expect(blended.to_occupancy.batch_id).toBe(host.batchId);   // no "new batch from two parents"
    expect(await volume(host.occupancyId)).toBe(10);
    expect(await volume(donor.occupancyId)).toBe(0);
    expect((await occupancyRow(donor.occupancyId)).ended_at).not.toBeNull();
  });

  it("refuses more than is in the vessel, its own vessel, and a closed source", async () => {
    const source = await brew("XFER-FV2", 8, "2026-11-03");
    const target = (await runCommand("upsert_vessel", { name: "XFER-BR2", kind: "brite", capacityBbl: 30 }, ctx)) as { id: string };

    await expect(runCommand("record_cellar_transfer",
      { fromOccupancyId: source.occupancyId, toVesselId: target.id, volumeBbl: 8, lossBbl: 0.5 }, ctx))
      .rejects.toThrow(/only 8/);
    await expect(runCommand("record_cellar_transfer",
      { fromOccupancyId: source.occupancyId, toVesselId: source.vesselId, volumeBbl: 1 }, ctx))
      .rejects.toThrow(/itself/);
    expect(await volume(source.occupancyId)).toBe(8);   // nothing moved

    await runCommand("record_cellar_transfer",
      { fromOccupancyId: source.occupancyId, toVesselId: target.id, volumeBbl: 8 }, ctx);
    await expect(runCommand("record_cellar_transfer",
      { fromOccupancyId: source.occupancyId, toVesselId: target.id, volumeBbl: 1 }, ctx))
      .rejects.toThrow(/closed/);
  });

  it("refuses another brewery's occupancy and vessel, and roles that are not admin or brewer", async () => {
    const mine = await brew("XFER-FV3", 5, "2026-11-04");
    const otherB = await makeBrewery();
    const otherCtx = await makeStaffCtx(otherB.id, "brewer");
    const theirVessel = (await runCommand("upsert_vessel", { name: "Their BR", kind: "brite", capacityBbl: 30 }, otherCtx)) as { id: string };

    await expect(runCommand("record_cellar_transfer",
      { fromOccupancyId: mine.occupancyId, toVesselId: theirVessel.id, volumeBbl: 1 }, ctx)).rejects.toThrow(/vessel not found/);
    await expect(runCommand("record_cellar_transfer",
      { fromOccupancyId: mine.occupancyId, toVesselId: theirVessel.id, volumeBbl: 1 }, otherCtx)).rejects.toThrow(/occupancy not found/);

    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("record_cellar_transfer",
      { fromOccupancyId: mine.occupancyId, toVesselId: theirVessel.id, volumeBbl: 1 }, sales)).rejects.toThrow(/permission denied/);
    expect(await volume(mine.occupancyId)).toBe(5);
  });
});

// ------------------------------------------------------------ fermentation readings
// Readings are manual entry in °F and °Plato (brewing-domain.md); nothing is
// ever synthesized, and a closed occupancy takes no more of them.
describe("fermentation readings", () => {
  let occupancyId: string;

  beforeAll(async () => {
    const vessel = (await runCommand("upsert_vessel", { name: "READ-FV1", kind: "fermenter", capacityBbl: 20 }, ctx)) as { id: string };
    const batch = (await runCommand("schedule_batch", { plannedOn: "2026-11-10", plannedBbl: 12 }, ctx)) as { id: string };
    const day = (await runCommand("record_brew_day",
      { batchId: batch.id, vesselId: vessel.id, initialBbl: 12, brewedOn: "2026-11-10" }, ctx)) as { occupancy: { id: string } };
    occupancyId = day.occupancy.id;
  });

  it("records readings and lists them newest first", async () => {
    await runCommand("record_fermentation_reading", {
      occupancyId, at: "2026-11-10T18:00:00Z", tempF: 68, gravityPlato: 14.2, ph: 5.2, note: "pitched",
    }, ctx);
    await runCommand("record_fermentation_reading", { occupancyId, at: "2026-11-11T18:00:00Z", tempF: 70.5, gravityPlato: 8.4 }, ctx);

    const rows = (await runCommand("list_fermentation_readings", { occupancyId }, ctx)) as {
      at: string; temp_f: number; gravity_plato: number | null; ph: number | null; note: string | null;
    }[];
    expect(rows).toHaveLength(2);
    expect(new Date(rows[0].at).toISOString()).toBe("2026-11-11T18:00:00.000Z");
    expect(Number(rows[0].temp_f)).toBe(70.5);
    expect(rows[0].ph).toBeNull();
    expect(Number(rows[1].gravity_plato)).toBe(14.2);
    expect(rows[1].note).toBe("pitched");
  });

  it("refuses a reading on a closed occupancy, another brewery's occupancy, and a non-brewer role", async () => {
    const otherCtx = await makeStaffCtx((await makeBrewery()).id, "brewer");
    await expect(runCommand("record_fermentation_reading", { occupancyId, at: "2026-11-11T19:00:00Z", tempF: 68 }, otherCtx))
      .rejects.toThrow(/occupancy not found/);
    const sales = await makeStaffCtx(b.id, "sales");
    await expect(runCommand("record_fermentation_reading", { occupancyId, at: "2026-11-11T19:00:00Z", tempF: 68 }, sales))
      .rejects.toThrow(/permission denied/);

    const brite = (await runCommand("upsert_vessel", { name: "READ-BR1", kind: "brite", capacityBbl: 20 }, ctx)) as { id: string };
    await runCommand("record_cellar_transfer", { fromOccupancyId: occupancyId, toVesselId: brite.id, volumeBbl: 12 }, ctx);
    await expect(runCommand("record_fermentation_reading", { occupancyId, at: "2026-11-12T18:00:00Z", tempF: 68 }, ctx))
      .rejects.toThrow(/closed/);
  });
});
