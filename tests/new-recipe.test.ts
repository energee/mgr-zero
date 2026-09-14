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
  });

  it("/recipes/new and /recipes/[id] draw the editor through RecipeView, never a detail override", () => {
    expect(src("app/(app)/recipes/new/page.tsx")).toMatch(/<RecipeEditor\b/);
    const detail = src("app/(app)/recipes/[id]/page.tsx");
    expect(detail).toMatch(/<RecipeView\b/);
    expect(detail).toMatch(/<RecipeEditor\b/);
    expect(detail).not.toMatch(/detail=/);
    const form = src("app/(app)/recipes/[id]/recipe-version-form.tsx");
    expect(form).toMatch(/<RecipeView\b/);
    expect(form).toMatch(/<NewRecipeFieldsView\b/);
    expect(form).not.toMatch(/<CommandForm\b|grid-cols-2|<Label\b|id="rv-/);
    expect(src("components/mgr/views/recipe.tsx")).not.toMatch(/detail\?:/);
    expect(form).toMatch(/"create_recipe"/);
    expect(form).toMatch(/router\.push\(`\/recipes\/\$\{/);
    expect(src("app/(app)/recipes/page.tsx")).toMatch(/E\.btn\("Create recipe", "p", "\/recipes\/new"\)/);
    expect(src("components/mgr/views/new-recipe.tsx")).not.toMatch(/use-command-form|fixtures|<CommandForm\b/);
  });
});
