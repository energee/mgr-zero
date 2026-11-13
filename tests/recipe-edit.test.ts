// tests/recipe-edit.test.ts — what a saved recipe can change after creation:
// its name and note (update_recipe, #1818).
import { beforeAll, describe, expect, it } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
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
