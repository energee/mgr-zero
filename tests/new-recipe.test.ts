// tests/new-recipe.test.ts — a recipe is created on the Recipe surface, not
// on a page of its own: the parent fields (name, style gated, optional brand
// and note) are one shared component, mounted by the inventory Recipe record
// in RecipeView's parentForm slot and by the live version form when it has
// no recipe yet. /recipes/new is that editor; one save writes create_recipe
// then create_recipe_version and lands on the recipe.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { SCREENS } from "../components/mgr/screens";
import { NewRecipeFieldsView } from "../components/mgr/views/new-recipe";
import { IngredientView } from "../components/mgr/views/ingredient";
import { RecipeView } from "../components/mgr/views/recipe";
import { recipeHazyV4 } from "../lib/mgr/fixtures/production";
import { SCREEN_ROUTES } from "../lib/mgr/screen-routes";
import { resolveTap } from "../lib/mgr/screen-links";

const src = (f: string) => readFileSync(f, "utf8");
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Recipe creation", () => {
  it("the parent fields are name, a gated style, optional brand and note, with no form of their own", () => {
    const html = renderToStaticMarkup(createElement(NewRecipeFieldsView, { brands: [{ id: "b1", name: "Hazy IPA" }] }));
    expect(html).toMatch(/>Name</);
    expect(html).toMatch(/data-gated[^>]*>[\s\S]*Style/);
    expect(html).toMatch(/Brand · optional/);
    expect(html).toMatch(/Note · optional/);
    expect(html).not.toMatch(/<form\b|<button[^>]*type="submit"/);
  });

  it("the inventory Recipe record mounts the parent fields in RecipeView's parentForm slot", () => {
    const body = screen("Recipe").body as { type: unknown; props: { parentForm: { type: unknown } } };
    expect(body.type).toBe(RecipeView);
    expect(body.props.parentForm.type).toBe(NewRecipeFieldsView);
    expect(screen("New recipe")).toBeUndefined();
    expect(SCREEN_ROUTES.find((r) => r.name === "New recipe")).toBeUndefined();
    expect(resolveTap(screen("Recipes"), "Create recipe")).toBe("Recipe");
  });

  it("RecipeView is the one editor: controlled when given controls, static for the fixture", () => {
    const fixture = renderToStaticMarkup(createElement(RecipeView, { model: recipeHazyV4 }));
    expect(fixture).not.toMatch(/<form\b/);
    expect(fixture).toMatch(/Create recipe version/);
    const set = vi.fn();
    const live = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", preBoil: "16.8", notes: "" }, controls: { set, onSubmit: () => {}, submitLabel: "Create recipe" } }));
    expect(live).toMatch(/<form\b/);
    expect(live).toMatch(/value="16.8"/);
    expect(live).toMatch(/grid-cols-2 md:grid-cols-4/);
    expect(live).toMatch(/data-gated[^>]*>[\s\S]*Default price group/);
    expect(live).toMatch(/<button[^>]*type="submit"[^>]*>Create recipe</);
    // A cut version is the same drawing with every field disabled and its schedules read out as rows.
    const cut = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Hazy v1", preBoil: "16.8", mash: { title: "Mash schedule · 1 steps", detail: "60 min", rows: [{ title: "Sacch", detail: "152 °F · 60 min" }] } } }));
    expect(cut).toMatch(/<input[^>]*disabled[^>]*value="16.8"/);
    expect(cut).toMatch(/Sacch/);
    expect(cut).not.toMatch(/<form\b|\+ add ingredient|Open/);
    // No scale chips: they previewed a batch size nothing supplies.
    expect(fixture).not.toMatch(/15 bbl|30 bbl/);
    // No version yet: no number is invented.
    const none = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Hazy", empty: "No version yet: create the first one", createHref: "/recipes/x/new" } }));
    expect(none).toMatch(/No version yet/);
    expect(none).not.toMatch(/Pre-boil volume/);
    expect(none).toMatch(/href="\/recipes\/x\/new"/);
  });

  it("/recipes/new and /recipes/[id] draw the editor through RecipeView, never a detail override", () => {
    expect(src("app/(app)/recipes/new/page.tsx")).toMatch(/<RecipeEditor\b/);
    const detail = src("app/(app)/recipes/[id]/page.tsx");
    expect(detail).toMatch(/<RecipeView\b/);
    expect(detail).not.toMatch(/detail=|searchParams/);
    expect(src("app/(app)/recipes/[id]/new/page.tsx")).toMatch(/<RecipeEditor\b/);
    const form = src("app/(app)/recipes/[id]/recipe-version-form.tsx");
    expect(form).toMatch(/<RecipeView\b/);
    expect(form).toMatch(/<NewRecipeFieldsView\b/);
    expect(form).not.toMatch(/<CommandForm\b|grid-cols-2|<Label\b|id="rv-/);
    expect(src("components/mgr/views/recipe.tsx")).not.toMatch(/detail\?:/);
    // "+ add ingredient" is the add action: it opens the ingredient editor itself, not a list with a second header.
    const sheets = src("app/(app)/recipes/[id]/schedule-sheets.tsx");
    expect(sheets).toMatch(/title=\{line \? "Edit ingredient" : "Add ingredient"\}/);
    expect(sheets).not.toMatch(/sheetTitle="Ingredients"/);
    expect(sheets).toMatch(/<IngredientView\b/);
    // Quantity is per barrel in the picked material's own unit, never a retyped one.
    const ing = renderToStaticMarkup(createElement(IngredientView, { fields: { materialId: "citra", stage: "dry_hop", perBblQty: "1.2", timingMinutes: "" }, materials: [{ id: "citra", name: "Citra", unit: "lb" }] }));
    expect(ing).toMatch(/Quantity per bbl/);
    expect(ing).toMatch(/lb \/ bbl/);
    expect(ing).not.toMatch(/Per bbl</);
    expect(sheets).not.toMatch(/<select\b/);
    // Edit is already a Button: it must be the trigger itself, never wrapped in a second button.
    expect(src("components/mgr/command-form.tsx")).toMatch(/node\.type === Button \? node/);
    expect(sheets).toMatch(/asTrigger\(trigger\)/);
    // Stages come from the view-model module, not the command registry.
    expect(src("components/mgr/views/ingredient.tsx")).not.toMatch(/lib\/commands/);
    expect(sheets).not.toMatch(/from "@\/lib\/commands\/production"/);
    // Leftovers from earlier iterations are gone: the explorer cancels every inert tap the same way, and Create recipe still walks to Recipe.
    expect(src("components/mgr/screen-explorer.tsx")).not.toMatch(/dialog-trigger|sheet-trigger/);
    expect(src("lib/mgr/screen-links.ts")).toMatch(/\["Create recipe", "Recipe"\]/);
    expect(screen("Ingredient").body).toBeTruthy();
    expect(form).toMatch(/"create_recipe"/);
    expect(form).toMatch(/router\.push\(`\/recipes\/\$\{/);
    expect(src("app/(app)/recipes/page.tsx")).toMatch(/E\.btn\("Create recipe", "p", "\/recipes\/new"\)/);
    expect(src("components/mgr/views/new-recipe.tsx")).not.toMatch(/use-command-form|fixtures|<CommandForm\b/);
  });
});
