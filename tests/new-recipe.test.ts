// tests/new-recipe.test.ts — Create recipe is a page, not a sheet: the
// Recipes list links to New recipe, which is the Recipe surface with the
// parent form (name, style gated, optional brand and note) in its detail
// slot. The inventory record and app/(app)/recipes/new mount the same view;
// creating lands on the recipe's own page for its first version.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { SCREENS } from "../components/mgr/screens";
import { NewRecipeFormView } from "../components/mgr/views/new-recipe";
import { RecipeView } from "../components/mgr/views/recipe";
import { SCREEN_ROUTES } from "../lib/mgr/screen-routes";
import { resolveTap } from "../lib/mgr/screen-links";

const src = (f: string) => readFileSync(f, "utf8");
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("New recipe", () => {
  it("draws name, a gated style, optional brand and note, and Create recipe", () => {
    const html = renderToStaticMarkup(createElement(NewRecipeFormView, { brands: [{ id: "b1", name: "Hazy IPA" }] }));
    expect(html).toMatch(/>Name</);
    expect(html).toMatch(/data-gated[^>]*>[\s\S]*Style/);
    expect(html).toMatch(/Brand · optional/);
    expect(html).toMatch(/Note · optional/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Create recipe</);
  });

  it("is the Recipe surface with the form in its detail slot, in the inventory", () => {
    const body = screen("New recipe").body as { type: unknown; props: { detail: { type: unknown }; model: { title: string } } };
    expect(body.type).toBe(RecipeView);
    expect(body.props.detail.type).toBe(NewRecipeFormView);
    expect(body.props.model.title).toBe("New recipe");
    expect(resolveTap(screen("Recipes"), "Create recipe")).toBe("New recipe");
    expect(resolveTap(screen("New recipe"), "Create recipe")).toBe("Recipe");
  });

  it("the live route mounts the same view and the list links to it", () => {
    expect(SCREEN_ROUTES.find((r) => r.name === "New recipe")?.file).toBe("app/(app)/recipes/new/page.tsx");
    const page = src("app/(app)/recipes/new/page.tsx");
    expect(page).toMatch(/<RecipeView\b/);
    expect(page).toMatch(/<NewRecipeForm\b/);
    const live = src("app/(app)/recipes/new-recipe-form.tsx");
    expect(live).toMatch(/<NewRecipeFormView\b/);
    expect(live).not.toMatch(/<form\b|<Input\b|<Select\b|<CommandForm\b/);
    expect(live).toMatch(/router\.push\(`\/recipes\/\$\{/);
    expect(src("app/(app)/recipes/page.tsx")).toMatch(/E\.btn\("Create recipe", "p", "\/recipes\/new"\)/);
    expect(src("components/mgr/views/new-recipe.tsx")).not.toMatch(/use-command-form|fixtures|<CommandForm\b/);
  });
});
