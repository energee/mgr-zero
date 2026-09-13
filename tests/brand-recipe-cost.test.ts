// tests/brand-recipe-cost.test.ts — get_brand_recipe_cost: the cost per
// barrel a brand's recipe implies, from recipe_version_costs (last receipt
// cost per ingredient; NULL while any ingredient has none), naming those
// ingredients, and which version speaks for the brand (last brewed, else
// newest). Also the view's reach: staff read it, a customer cannot.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, seedMaterial, seedMovement } from "./helpers";
import { runCommand, unwrap } from "@/lib/commands/registry";
import "@/lib/commands/all";

// Sales reads the cost (it prices); Brewer writes the recipes.
let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let brewer: Awaited<ReturnType<typeof makeStaffCtx>>;
let brandId: string;
let malt: string;
let hop: string;
let wh: { id: string; binId: string };
let recipeId: string;
let v1: string;

const receipt = (materialId: string, unitCostCents: number) =>
  seedMovement(ctx.breweryId, { materialId, locationId: wh.id, binId: wh.binId, qty: 100, type: "receipt", unitCostCents, createdBy: ctx.userId });
const cost = () => runCommand("get_brand_recipe_cost", { brandId }, ctx);

beforeAll(async () => {
  const b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "sales");
  brewer = await makeStaffCtx(b.id, "brewer");
  ({ brandId } = await seedCatalog(b.id, { product: "Costed IPA", sku: "Costed IPA · ½ bbl" }));
  wh = await seedLocation(b.id);
  malt = await seedMaterial(b.id, { name: "Pale Ale Malt", category: "malt" });
  hop = await seedMaterial(b.id, { name: "Citra", category: "hop" });
  await receipt(malt, 100);
});

describe("get_brand_recipe_cost", () => {
  it("is empty for a brand with no recipe", async () => {
    expect(await cost()).toEqual({ recipeVersionId: null, costCentsPerBbl: null, uncosted: [] });
  });

  it("reports no cost while an ingredient has no receipt, naming it once, then sums per barrel", async () => {
    ({ id: recipeId } = (await runCommand("create_recipe", { name: "Costed IPA", brandId }, brewer)) as { id: string });
    // Citra at two stages is one gap, not two.
    ({ id: v1 } = (await runCommand("create_recipe_version", {
      recipeId, mashTempF: 152, brewhouseEfficiency: 0.75, yeastAttenuation: 0.78,
      ingredients: [
        { materialId: malt, perBblQty: 60, stage: "mash" },
        { materialId: hop, perBblQty: 1, stage: "boil", timingMinutes: 60 },
        { materialId: hop, perBblQty: 0.5, stage: "dry_hop" },
      ],
    }, brewer)) as { id: string });
    // The view is NULL, not the malt-only partial sum, until every ingredient has a receipt.
    expect(await cost()).toEqual({ recipeVersionId: v1, costCentsPerBbl: null, uncosted: ["Citra"] });
    await receipt(hop, 2000);
    // 60 × $1.00 + (1 + 0.5) × $20.00 per bbl.
    expect(await cost()).toEqual({ recipeVersionId: v1, costCentsPerBbl: 9000, uncosted: [] });
  });

  it("divides a receipt cost by the material's purchase factor", async () => {
    // Bought by the 4-unit case at $4.00 a case: $1.00 per base unit.
    const hulls = await seedMaterial(ctx.breweryId, { name: "Rice hulls", category: "adjunct" });
    await admin.from("materials").update({ purchase_uom_factor: 4 }).eq("id", hulls);
    await receipt(hulls, 400);
    const other = (await runCommand("create_recipe", { name: "Hulls only", brandId }, brewer)) as { id: string };
    const v = (await runCommand("create_recipe_version", { recipeId: other.id, mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8, ingredients: [{ materialId: hulls, perBblQty: 10, stage: "mash" }] }, brewer)) as { id: string };
    expect(await cost()).toEqual({ recipeVersionId: v.id, costCentsPerBbl: 1000, uncosted: [] });
  });

  it("lets the last brewed version speak for the brand over a newer one, ignoring other brands and unrecorded brews", async () => {
    const other = await seedCatalog(ctx.breweryId, { product: "Someone Else", sku: "Someone Else · ½ bbl" });
    const theirs = (await runCommand("create_recipe", { name: "Theirs", brandId: other.brandId }, brewer)) as { id: string };
    const theirV = (await runCommand("create_recipe_version", { recipeId: theirs.id, mashTempF: 150, brewhouseEfficiency: 0.8, yeastAttenuation: 0.8, ingredients: [{ materialId: malt, perBblQty: 1, stage: "mash" }] }, brewer)) as { id: string };
    const batch = (recipeVersionId: string | null, intended: string, brewedOn: string) => unwrap(admin.from("batches").insert({
      brewery_id: ctx.breweryId, intended_brand_id: intended, recipe_version_id: recipeVersionId, planned_on: "2026-09-01", planned_bbl: 15, brewed_on: brewedOn, created_by: ctx.userId,
    }));
    // Another brand's brew, and a brew of ours that never named a version, change nothing.
    await batch(theirV.id, other.brandId, "2026-09-05");
    await batch(null, brandId, "2026-09-06");
    expect((await cost() as { recipeVersionId: string }).recipeVersionId).not.toBe(theirV.id);
    await batch(v1, brandId, "2026-09-02");
    expect(await cost()).toEqual({ recipeVersionId: v1, costCentsPerBbl: 9000, uncosted: [] });
  });

  it("is a Sales and Admin read", async () => {
    const warehouse = await makeStaffCtx(ctx.breweryId, "warehouse");
    await expect(runCommand("get_brand_recipe_cost", { brandId }, warehouse)).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the cost view inside the brewery: staff see rows, a customer sees none", async () => {
    const mine = await ctx.db.from("recipe_version_costs").select("recipe_version_id").eq("recipe_version_id", v1);
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(1);
    const customer = await seedCustomer(ctx.breweryId);
    const user = await makeCustomerUser(customer.customerId);
    const theirs = await (await asUser(user.email)).from("recipe_version_costs").select("recipe_version_id");
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
  });
});
