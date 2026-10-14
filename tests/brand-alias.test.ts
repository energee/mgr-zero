// tests/brand-alias.test.ts — a brand's staff-only alias (an informal name such
// as a series number) and a recipe's brand that can change after creation
// (docs/plans/brand-alias.md). The alias never reaches a portal customer.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCatalog, seedCustomer } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Brand = { id: string; name: string; alias: string | null };
let breweryId: string;
let owner: Ctx;
let brewer: Ctx;
let sales: Ctx;

const once = (requestId: string) => ({ requestId, correlationId: requestId });
const upsert = (input: Record<string, unknown>, ctx: Ctx = owner) => runCommand("upsert_brand", input, ctx) as Promise<Brand>;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  brewer = await makeStaffCtx(breweryId, "brewer");
  sales = await makeStaffCtx(breweryId, "sales");
});

describe("brand alias", () => {
  it("saves and reads back; a blank alias is refused", async () => {
    const b = await upsert({ name: "Appaloosa", alias: "Animal #14" });
    expect(b.alias).toBe("Animal #14");
    const listed = await runCommand("list_brands", {}, owner) as Brand[];
    expect(listed.find((x) => x.id === b.id)?.alias).toBe("Animal #14");
    await expect(upsert({ name: "Blank alias", alias: "   " })).rejects.toThrow();
  });

  it("is replaced like every other field: an edit without it clears it", async () => {
    const b = await upsert({ name: "Ocelot", alias: "Animal #15" });
    expect((await upsert({ id: b.id, name: "Ocelot", alias: "Animal 15" })).alias).toBe("Animal 15");
    expect((await upsert({ id: b.id, name: "Ocelot" })).alias).toBeNull();
  });

  it("a portal customer reads no brand row, so no alias", async () => {
    const { brandId } = await seedCatalog(breweryId, { product: "Dalmatian", sku: "Dalmatian case" });
    await upsert({ id: brandId, name: "Dalmatian", alias: "Animal #16" });
    const { customerId } = await seedCustomer(breweryId, { name: "Alias buyer" });
    const user = await makeCustomerUser(customerId);
    const db = await asUser(user.email);
    const direct = await db.from("brands").select("id, alias").eq("id", brandId);
    expect(direct.data ?? []).toEqual([]);
  });

  it("staff search finds a brand's SKUs by its alias", async () => {
    const { brandId } = await seedCatalog(breweryId, { product: "Sapphire", sku: "Sapphire case" });
    await upsert({ id: brandId, name: "Sapphire", alias: "Rock/Mineral #1" });
    const hits = await runCommand("search_entities", { q: "Rock/Mineral" }, owner) as { kind: string; label: string }[];
    expect(hits).toContainEqual(expect.objectContaining({ kind: "sku", label: "Sapphire case" }));
  });
});

describe("set_recipe_brand", () => {
  it("sets and clears a recipe's brand; scheduled batches keep theirs", async () => {
    const lager = await upsert({ name: "Recipe Lager" });
    const pils = await upsert({ name: "Recipe Pils" });
    const recipe = await runCommand("create_recipe", { name: "Lager base" }, brewer) as { id: string };
    const set = await runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: lager.id }, brewer) as { brand_id: string | null };
    expect(set.brand_id).toBe(lager.id);
    const batch = await runCommand("schedule_batch", { plannedOn: "2026-11-01", plannedBbl: 10, intendedBrandId: lager.id }, brewer) as { id: string };
    await runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: pils.id }, brewer);
    const kept = (await admin.from("batches").select("intended_brand_id").eq("id", batch.id).single().throwOnError()).data!;
    expect(kept.intended_brand_id).toBe(lager.id);
    const cleared = await runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: null }, brewer) as { brand_id: string | null };
    expect(cleared.brand_id).toBeNull();
  });

  it("refuses another brewery's brand, a sales role, and replays", async () => {
    const recipe = await runCommand("create_recipe", { name: "Guarded recipe" }, brewer) as { id: string };
    const otherOwner = await makeStaffCtx((await makeBrewery()).id, "admin");
    const foreign = await upsert({ name: "Foreign" }, otherOwner);
    await expect(runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: foreign.id }, brewer)).rejects.toThrow(/brand not found/);
    await expect(runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: null }, sales)).rejects.toThrow(/permission denied/);
    const brand = await upsert({ name: "Replay brand" });
    const requestId = crypto.randomUUID();
    const first = await runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: brand.id }, brewer, once(requestId));
    expect(await runCommand("set_recipe_brand", { recipeId: recipe.id, brandId: brand.id }, brewer, once(requestId))).toEqual(first);
  });
});
