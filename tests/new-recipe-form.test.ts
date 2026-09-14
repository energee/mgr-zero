// tests/new-recipe-form.test.ts — Create recipe is one shared surface:
// components/mgr/views/new-recipe-form.tsx draws the sheet and its fields;
// the inventory Recipes record mounts it with fixture brands, the live page
// mounts it bound to create_recipe. Style is drawn gated (recipes has no
// style_id yet), so neither side invents it.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { SCREENS } from "../components/mgr/screens";
import { RecipesView } from "../components/mgr/views/recipes";
import { NewRecipeFieldsView, NewRecipeFormView } from "../components/mgr/views/new-recipe-form";
import { isInertOn } from "../lib/mgr/screen-links";

const src = (f: string) => readFileSync(f, "utf8");
const brands = [{ id: "b1", name: "Hazy IPA" }];

describe("Create recipe", () => {
  it("draws name, optional brand and note, and a gated style", () => {
    const html = renderToStaticMarkup(createElement(NewRecipeFieldsView, { brands, values: { name: "", brandId: "", note: "" } }));
    expect(html).toMatch(/>Name</);
    expect(html).toMatch(/Brand · optional/);
    expect(html).toMatch(/Note · optional/);
    expect(html).toMatch(/data-gated[^>]*>[\s\S]*Style/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Create recipe</);
    expect(html).not.toMatch(/Hazy IPA v4|Pils/);
  });

  it("the inventory Recipes record mounts the shared sheet as its create action", () => {
    const body = SCREENS.find((s) => s.name === "Recipes")!.body as { type: unknown; props: { createAction: { type: unknown } } };
    expect(body.type).toBe(RecipesView);
    expect(body.props.createAction.type).toBe(NewRecipeFormView);
    expect(src("components/mgr/screens.tsx")).not.toMatch(/E\.btn\("Create recipe"\)/);
  });

  it("the live adapter delegates to the shared sheet and draws no form of its own", () => {
    const live = src("app/(app)/recipes/new-recipe-form.tsx");
    expect(live).toMatch(/<NewRecipeFormView\b/);
    expect(live).not.toMatch(/<form\b|<Input\b|<Select\b|<CommandForm\b/);
    expect(src("components/mgr/views/new-recipe-form.tsx")).not.toMatch(/use-command-form|fixtures/);
  });

  it("Create recipe opens the sheet in place in the explorer, as it does live", () => {
    const recipes = SCREENS.find((s) => s.name === "Recipes")!;
    expect(isInertOn(recipes, "Create recipe")).toBe(true);
  });
});
