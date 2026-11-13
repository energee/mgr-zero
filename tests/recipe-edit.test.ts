// tests/recipe-edit.test.ts — what a saved recipe can change after creation:
// its name and note (update_recipe, #1818), and which copy its scheduled
// batches brew (create_recipe_version moves the unbrewed ones, #1817).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedMaterial } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Recipe = { id: string; name: string; note: string | null };
let breweryId: string;
let brewer: Ctx;
let sales: Ctx;

const once = (requestId: string) => ({ requestId, correlationId: requestId });

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  brewer = await makeStaffCtx(breweryId, "brewer");
  sales = await makeStaffCtx(breweryId, "sales");
});

describe("update_recipe", () => {
  it("renames a recipe and changes or clears its note", async () => {
    const recipe = await runCommand("create_recipe", { name: "Hazy IPO", note: "First draft" }, brewer) as Recipe;
    const renamed = await runCommand("update_recipe", { recipeId: recipe.id, name: "  Hazy IPA ", note: "House hazy" }, brewer) as Recipe;
    expect(renamed).toMatchObject({ id: recipe.id, name: "Hazy IPA", note: "House hazy" });
    const cleared = await runCommand("update_recipe", { recipeId: recipe.id, name: "Hazy IPA", note: null }, brewer) as Recipe;
    expect(cleared.note).toBeNull();
    const read = await runCommand("get_recipe", { recipeId: recipe.id }, brewer) as { recipe: Recipe };
    expect(read.recipe).toMatchObject({ name: "Hazy IPA", note: null });
  });

  it("refuses a blank name, a taken name, a sales role and another brewery's recipe, and replays", async () => {
    const recipe = await runCommand("create_recipe", { name: "Guarded name" }, brewer) as Recipe;
    await runCommand("create_recipe", { name: "Taken name" }, brewer);
    await expect(runCommand("update_recipe", { recipeId: recipe.id, name: "   ", note: null }, brewer)).rejects.toThrow();
    await expect(runCommand("update_recipe", { recipeId: recipe.id, name: "Taken name", note: null }, brewer)).rejects.toThrow(/already used/);
    await expect(runCommand("update_recipe", { recipeId: recipe.id, name: "Sales name", note: null }, sales)).rejects.toThrow(/permission denied/);
    const outsider = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("update_recipe", { recipeId: recipe.id, name: "Outsider name", note: null }, outsider)).rejects.toThrow(/recipe not found/);
    const requestId = crypto.randomUUID();
    const first = await runCommand("update_recipe", { recipeId: recipe.id, name: "Replayed name", note: null }, brewer, once(requestId));
    expect(await runCommand("update_recipe", { recipeId: recipe.id, name: "Replayed name", note: null }, brewer, once(requestId))).toEqual(first);
  });
});

describe("create_recipe_version moves scheduled batches", () => {
  const mashSchedule = [{ name: "Rest", kind: "infusion", tempF: 152, minutes: 60 }];
  const batchVersion = async (batchId: string) =>
    (await admin.from("batches").select("recipe_version_id").eq("id", batchId).single().throwOnError()).data!.recipe_version_id;

  it("moves unbrewed, uncancelled batches of the recipe to the new copy and says how many", async () => {
    const owner = await makeStaffCtx(breweryId, "admin");
    const malt = await seedMaterial(breweryId, { name: "Move malt", category: "malt" });
    const hop = await seedMaterial(breweryId, { name: "Move hop", category: "hop" });
    const location = await seedLocation(breweryId);
    const save = (recipeId: string, perBblQty: number, extra: { materialId: string; perBblQty: number; stage: string }[] = []) =>
      runCommand("create_recipe_version", { recipeId, mashSchedule, brewhouseEfficiency: 0.75, yeastAttenuation: 0.8, ingredients: [...extra, { materialId: malt, perBblQty, stage: "mash" }] }, brewer) as Promise<{ id: string; moved_batches: number }>;
    const schedule = (recipeVersionId: string) =>
      runCommand("schedule_batch", { plannedOn: "2026-12-01", plannedBbl: 10, recipeVersionId }, brewer) as Promise<{ id: string }>;

    const recipe = await runCommand("create_recipe", { name: "Moving recipe" }, brewer) as Recipe;
    const other = await runCommand("create_recipe", { name: "Other recipe" }, brewer) as Recipe;
    const v1 = await save(recipe.id, 40);
    expect(v1.moved_batches).toBe(0);
    const otherV1 = await save(other.id, 40);

    const scheduled = await schedule(v1.id);
    const pulled = await schedule(v1.id);
    const cancelled = await schedule(v1.id);
    const brewed = await schedule(v1.id);
    const elsewhere = await schedule(otherV1.id);
    await runCommand("cancel_batch", { batchId: cancelled.id }, brewer);
    const vessel = await runCommand("upsert_vessel", { name: "FV move", kind: "fermenter", capacityBbl: 20 }, owner) as { id: string };
    await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: brewed.id, vesselId: vessel.id, initialBbl: 10, brewedOn: "2026-12-01" }, brewer);
    // Prep's draft pulls: one for the malt line, one for no recipe line.
    const oldLine = (await admin.from("recipe_ingredients").select("id").eq("recipe_version_id", v1.id).single().throwOnError()).data!;
    const source = { material_id: malt, location_id: location.id, bin_id: location.binId, lot_id: null };
    const pulls = await brewer.db.rpc("save_batch_pulls", { p_brewery: breweryId, p_batch: pulled.id, p_vessel: vessel.id, p_request_id: crypto.randomUUID(),
      p_lines: [{ ...source, recipe_ingredient_id: oldLine.id, qty: 400 }, { ...source, material_id: hop, qty: 1 }] });
    if (pulls.error) throw new Error(pulls.error.message);

    // The new copy adds a hop above the malt and changes the malt's amount.
    const v2 = await save(recipe.id, 42, [{ materialId: hop, perBblQty: 1, stage: "boil" }]);
    expect(v2.moved_batches).toBe(2);
    expect(await batchVersion(scheduled.id)).toBe(v2.id);
    expect(await batchVersion(pulled.id)).toBe(v2.id);
    expect(await batchVersion(cancelled.id)).toBe(v1.id);
    expect(await batchVersion(brewed.id)).toBe(v1.id);
    expect(await batchVersion(elsewhere.id)).toBe(otherV1.id);

    // The malt pull follows the malt line into the new copy; the pull with no line is untouched.
    const newMalt = (await admin.from("recipe_ingredients").select("id").eq("recipe_version_id", v2.id).eq("material_id", malt).single().throwOnError()).data!;
    const kept = (await admin.from("brew_pulls").select("material_id,recipe_ingredient_id,qty").eq("batch_id", pulled.id).order("qty").throwOnError()).data!;
    expect(kept).toEqual([{ material_id: hop, recipe_ingredient_id: null, qty: 1 }, { material_id: malt, recipe_ingredient_id: newMalt.id, qty: 400 }]);
    const plan = (await admin.from("batches").select("planned_vessel_id").eq("id", pulled.id).single().throwOnError()).data!;
    expect(plan.planned_vessel_id).toBe(vessel.id);

    // A copy that drops the malt line drops the pull that was for it.
    const v3 = await runCommand("create_recipe_version", { recipeId: recipe.id, mashSchedule, brewhouseEfficiency: 0.75, yeastAttenuation: 0.8, ingredients: [{ materialId: hop, perBblQty: 1, stage: "boil" }] }, brewer) as { id: string; moved_batches: number };
    expect(v3.moved_batches).toBe(2);
    const left = (await admin.from("brew_pulls").select("material_id").eq("batch_id", pulled.id).throwOnError()).data!;
    expect(left).toEqual([{ material_id: hop }]);
  });
});
