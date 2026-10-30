// tests/new-recipe.test.ts — a recipe is created on the Recipe surface, not
// on a page of its own: the parent fields (name, optional brand and note) are one shared component, mounted by the inventory Recipe record
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
import { INGREDIENT_STAGE_OPTIONS, IngredientView } from "../components/mgr/views/ingredient";
import { MashStepView } from "../components/mgr/views/mash-schedule";
import { FermentationScheduleView, FermentationStageView } from "../components/mgr/views/fermentation-schedule";
import { WaterAdditionView, WaterView } from "../components/mgr/views/water";
import { BrewDayView } from "../components/mgr/views/brew-day";
import { EMPTY_WATER, INGREDIENT_STAGES } from "../lib/mgr/recipe-process-view";
import { RecipeView } from "../components/mgr/views/recipe";
import { recipeHazyV4 } from "../lib/mgr/fixtures/production";
import { SCREEN_ROUTES } from "../lib/mgr/screen-routes";
import { isInertOn, resolveTap } from "../lib/mgr/screen-links";

const src = (f: string) => readFileSync(f, "utf8");
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("Recipe creation", () => {
  it("the parent fields are name, optional brand and note, with no form of their own", () => {
    const html = renderToStaticMarkup(createElement(NewRecipeFieldsView, { brands: [{ id: "b1", name: "Hazy IPA" }] }));
    expect(html).toMatch(/>Name</);
    expect(html).not.toMatch(/Style/);
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
    expect(resolveTap(screen("Recipes"), "New recipe")).toBe("Recipe");
  });

  it("bounds the process numbers as create_recipe_version does, so the browser refuses them first (#447)", () => {
    const live = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", notes: "" }, controls: { set: () => {}, onSubmit: () => {} } }));
    const input = (label: string) => new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`).exec(live)?.[0] ?? "";
    expect(input("Boil time min")).toMatch(/min="1"[^>]*step="1"|step="1"[^>]*min="1"/);
    expect(input("Whirlpool min")).toMatch(/min="0"/);
    expect(input("Whirlpool min")).toMatch(/step="1"/);
    expect(input("Whirlpool rest min")).toMatch(/step="1"/);
    expect(input("Pre-boil volume bbl")).toMatch(/min="0.01"/);
  });

  it("RecipeView is the one editor: controlled when given controls, static for the fixture", () => {
    const fixture = renderToStaticMarkup(createElement(RecipeView, { model: recipeHazyV4 }));
    expect(fixture).not.toMatch(/<form\b/);
    expect(fixture).toMatch(/New recipe version/);
    const set = vi.fn();
    const live = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", preBoil: "16.8", notes: "" }, controls: { set, onSubmit: () => {}, submitLabel: "Create recipe" } }));
    expect(live).toMatch(/<form\b/);
    expect(live).toMatch(/value="16.8"/);
    expect(live).toMatch(/grid-cols-2 md:grid-cols-4/);
    expect(live).toMatch(/<button[^>]*type="submit"[^>]*>Create recipe</);
    // A cut version is read out as text, its schedules as rows under their headings.
    const cut = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Hazy v1", preBoil: "16.8", mash: { title: "Mash schedule · 1 step", detail: "60 min", rows: [{ title: "Sacch", detail: "152 °F · 60 min" }] } } }));
    expect(cut).toMatch(/Sacch/);
    expect(cut).not.toMatch(/<form\b|Add ingredient|Open/);
    // No scale chips: they previewed a batch size nothing supplies.
    expect(fixture).not.toMatch(/15 bbl|30 bbl/);
    // No version yet: no number is invented.
    const none = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Hazy", empty: { title: "No version yet" }, createHref: "/recipes/x/new" } }));
    expect(none).toMatch(/No version yet/);
    expect(none).not.toMatch(/Pre-boil volume/);
    expect(none).toMatch(/href="\/recipes\/x\/new"/);
  });

  describe("the ingredient sheet fields (plan task 13)", () => {
    const materials = [{ id: "citra", name: "Citra", unit: "lb", category: "hop" }, { id: "cans", name: "Cans", unit: "each" }];
    const draw = (materialId: string) => renderToStaticMarkup(createElement(IngredientView, { fields: { materialId, stage: "dry_hop", perBblQty: "1.2", timing: "" }, materials }));

    it("an option reads name · category, or the name alone when no category is known", () => {
      expect(draw("citra")).toContain("Citra · hop");
      expect(draw("cans")).toContain("Cans");
    });

    it("the quantity label is tied to its input and names the unit", () => {
      const html = draw("citra");
      const forId = /<label[^>]*for="([^"]+)"[^>]*>Quantity per bbl \(lb\)<\/label>/.exec(html)?.[1];
      expect(forId).toBeTruthy();
      expect(html).toContain(`id="${forId}"`);
      expect(html).toMatch(new RegExp(`<input[^>]*id="${forId}"[^>]*>`));
    });

    it("quantity and timing use matching numeric steppers, including fractional quantities (#1263)", () => {
      const html = draw("citra");
      expect(html.match(/aria-label="Decrease"/g)).toHaveLength(2);
      expect(html.match(/aria-label="Increase"/g)).toHaveLength(2);
      expect(html).toMatch(/<input[^>]*aria-label="Quantity per bbl \(lb\)"[^>]*value="1.2"/);
      // A dry-hop line is timed in days from the start of fermentation (#1478).
      expect(html).toMatch(/<input[^>]*aria-label="Timing day · optional"[^>]*value=""/);
      expect(html.match(/step="any"/g)).toHaveLength(2);
    });

    it("the material trigger acts in place on the Ingredient record", () => {
      expect(isInertOn(screen("Ingredient"), "Material")).toBe(true);
      expect(isInertOn(screen("Cycle count"), "Material")).toBe(false);
    });
  });

  describe("the read-out and the draft blocker (plan task 8)", () => {
    const versioned = { title: "Hazy v1", createHref: "/recipes/x/new", preBoil: "16.8", efficiency: "72.5", notes: "", ingredients: [{ key: "m", title: "2-row", detail: "Mash · 40.9 lb / bbl", qty: "" }] };
    const empty = { title: "Hazy", createHref: "/recipes/x/new", empty: { title: "No version yet" } };
    const draw = (props: Parameters<typeof RecipeView>[0]) => renderToStaticMarkup(createElement(RecipeView, props));
    const draft = (blockedReason?: string) => draw({ model: { title: "Hazy v2", notes: "" }, controls: { set: () => {}, onSubmit: () => {}, blockedReason } });

    it("a cut version reads its numbers as text, with no input", () => {
      const cut = draw({ readOnly: true, model: versioned });
      expect(cut).toMatch(/<dt[^>]*>Pre-boil volume bbl<\/dt>/);
      expect(cut).toMatch(/<dd[^>]*>16.8<\/dd>/);
      expect(cut).not.toMatch(/<input/);
      // Only the numbers the version holds are read out.
      expect(cut).not.toMatch(/Boil time min/);
    });

    it("the one New recipe version sits in the title row, empty or versioned, read-only or not", () => {
      for (const model of [versioned, empty]) {
        for (const readOnly of [true, false]) {
          const html = draw({ model, readOnly, parentForm: createElement("p", null, "PARENT") });
          expect(html.match(/New recipe version/g)).toHaveLength(1);
          const verb = html.indexOf("New recipe version");
          expect(verb).toBeGreaterThan(html.indexOf("</h1>"));
          expect(verb).toBeLessThan(html.indexOf("PARENT"));
          expect(html).toMatch(/href="\/recipes\/x\/new"/);
        }
      }
    });

    it("a live page draws no Default price group; the inventory keeps its picker", () => {
      expect(draw({ readOnly: true, model: versioned })).not.toMatch(/Default price group/);
      expect(draft()).not.toMatch(/Default price group/);
      expect(draw({ model: recipeHazyV4 })).toMatch(/Default price group/);
    });

    it("says what the draft lacks and disables the submit", () => {
      const html = draft("Add a mash step.");
      expect(html).toMatch(/<div role="status">[^]*Add a mash step\.[^]*<\/div>/);
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
      expect(draft()).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    });

    it("draws no tape list without a tape", () => {
      expect(draw({ readOnly: true, model: versioned })).not.toMatch(/<ol\b/);
      expect(draw({ model: recipeHazyV4 })).toMatch(/<ol\b/);
    });

    it("shows the recipe note, the saved date and a version note under headings", () => {
      const html = draw({ readOnly: true, model: { ...versioned, recipeNote: "House IPA", saved: "Aug 28, 2026", notes: "Knock out cold." } });
      expect(html).toMatch(/Recipe note[^]*House IPA/);
      expect(html).toMatch(/<dt[^>]*>Saved<\/dt><dd[^>]*>Aug 28, 2026<\/dd>/);
      expect(html).toMatch(/<dt[^>]*>Version note<\/dt><dd[^>]*>Knock out cold\.<\/dd>/);
      expect(html).toMatch(/<h2[^>]*>Ingredients<\/h2>/);
      expect(html).toMatch(/<h2[^>]*>Process<\/h2>/);
      expect(draw({ readOnly: true, model: versioned })).not.toMatch(/Recipe note|Version note/);
      expect(draft()).toMatch(/aria-label="Version note"|>Version note</);
    });
  });

  it("/recipes/new and /recipes/[id] draw the editor through RecipeView, never a detail override", () => {
    expect(src("app/(app)/recipes/new/page.tsx")).toMatch(/<RecipeEditor\b/);
    const detail = src("app/(app)/recipes/[id]/page.tsx");
    expect(detail).toMatch(/<RecipeView\b/);
    // Version history may use search params; the removed alternate detail drawing must stay gone.
    expect(detail).not.toMatch(/detail=/);
    const next = src("app/(app)/recipes/[id]/new/page.tsx");
    expect(next).toMatch(/<RecipeEditor\b/);
    // The next version starts as a copy of the current one, and a draft left in this tab comes back.
    expect(next).toMatch(/initial=\{versionToDraft\(snapshot\)/);
    const form = src("app/(app)/recipes/[id]/recipe-version-form.tsx");
    expect(form).toMatch(/\breadRecipeDraft\b[^]*\bwriteRecipeDraft\b|\bwriteRecipeDraft\b[^]*\breadRecipeDraft\b/);
    expect(form).toMatch(/import \{[^}]*\breadRecipeDraft\b[^}]*\} from "@\/lib\/mgr\/recipe-draft"/);
    expect(form).toMatch(/import \{[^}]*\bwriteRecipeDraft\b[^}]*\} from "@\/lib\/mgr\/recipe-draft"/);
    expect(form).toMatch(/<RecipeView\b/);
    expect(form).toMatch(/<NewRecipeFieldsView\b/);
    expect(form).not.toMatch(/<CommandForm\b|grid-cols-2|<Label\b|id="rv-/);
    expect(src("components/mgr/views/recipe.tsx")).not.toMatch(/detail\?:/);
    // "Add ingredient" is the add action: it opens the ingredient editor itself, not a list with a second header.
    const sheets = src("app/(app)/recipes/[id]/schedule-sheets.tsx");
    expect(sheets).toMatch(/title=\{line \? "Edit ingredient" : "Add ingredient"\}/);
    expect(sheets).not.toMatch(/sheetTitle="Ingredients"/);
    expect(sheets).toMatch(/<IngredientView\b/);
    // Quantity is per barrel in the picked material's own unit, never a retyped one.
    const ing = renderToStaticMarkup(createElement(IngredientView, { fields: { materialId: "citra", stage: "dry_hop", perBblQty: "1.2", timing: "" }, materials: [{ id: "citra", name: "Citra", unit: "lb" }] }));
    expect(ing).toMatch(/Quantity per bbl/);
    expect(ing).toMatch(/Quantity per bbl \(lb\)/);
    expect(ing).not.toMatch(/Per bbl</);
    expect(sheets).not.toMatch(/<select\b/);
    // Edit is already a Button: it must be the trigger itself, never wrapped in a second button.
    expect(src("components/mgr/command-form.tsx")).toMatch(/node\.type === Button \? node/);
    expect(sheets).toMatch(/asTrigger\(trigger\)/);
    // Stages come from the view-model module, not the command registry.
    expect(src("components/mgr/views/ingredient.tsx")).not.toMatch(/lib\/commands/);
    expect(sheets).not.toMatch(/from "@\/lib\/commands\/production"/);
    expect(src("components/mgr/screen-explorer.tsx")).not.toMatch(/dialog-trigger|sheet-trigger/);
    expect(screen("Ingredient").body).toBeTruthy();
    expect(form).toMatch(/"create_recipe"/);
    expect(form).toMatch(/router\.push\(`\/recipes\/\$\{/);
    expect(src("components/mgr/views/new-recipe.tsx")).not.toMatch(/use-command-form|fixtures|<CommandForm\b/);
  });
});

describe("recipe form copy (#1139)", () => {
  const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

  it("the brand note says what to do, in brewer words", () => {
    const fields = html(createElement(NewRecipeFieldsView, { brands: [] }));
    expect(fields).toContain("Pick the brand this recipe brews, or leave it undecided. Packaging always asks for the brand.");
    // Schedule batch starts at Not decided whatever recipe is picked, so the note promises no pre-fill.
    expect(fields).not.toMatch(/intent only|identity is required|New batches start/);
  });

  it("the add-ingredient row reads like every other create action", () => {
    const draft = html(createElement(RecipeView, { model: { title: "Hazy v2", notes: "" } }));
    expect(draft).toContain("Add ingredient");
    expect(draft).toContain("Material, stage and timing");
    expect(draft).not.toMatch(/\+ add ingredient|material · stage · timing/);
  });

  it("stage and type picks show sentence case and keep the stored value", () => {
    expect(INGREDIENT_STAGE_OPTIONS.map((o) => o.value)).toEqual([...INGREDIENT_STAGES]);
    expect(INGREDIENT_STAGE_OPTIONS.map((o) => o.label)).toEqual(["Mash", "Boil", "Whirlpool", "Fermentation", "Dry hop", "Packaging", "Other"]);
    expect(html(createElement(IngredientView, { fields: { materialId: "", stage: "dry_hop", perBblQty: "", timing: "" }, materials: [] }))).toMatch(/>Dry hop</);
    expect(html(createElement(MashStepView, { fields: { name: "Mash-out", kind: "direct heat", tempF: "168", minutes: "10" } }))).toMatch(/>Direct heat</);
    expect(html(createElement(FermentationStageView, { fields: { name: "Rest", kind: "diacetyl rest", tempF: "72", days: "2" } }))).toMatch(/>Diacetyl rest</);
    expect(html(createElement(WaterAdditionView, { fields: { materialId: "", qty: "", unit: "g", stage: "sparge" }, materials: [] }))).toMatch(/>Sparge</);
  });

  it("the add-addition row reads like the add-ingredient row", () => {
    const water = html(createElement(WaterView, { water: EMPTY_WATER, profiles: [], materials: [] }));
    expect(water).toContain("Material, amount and stage");
    expect(water).not.toContain("material · amount · stage");
  });

  it("fermentation explains how to start planning an empty schedule (#1263)", () => {
    const schedule = html(createElement(FermentationScheduleView, { stages: [] }));
    expect(schedule).toContain("No stages yet");
    expect(schedule).toContain("Add a stage to plan temperatures and timing.");
    expect(schedule).not.toContain("Add stage is the only action.");
  });

  it("brew day's Stage pick reuses the recipe's stage options", () => {
    const brew = html(createElement(BrewDayView, { model: {
      title: "Batch", vesselId: "v", vessels: [{ id: "v", name: "FV", kind: "fermenter", capacity_bbl: 10 }], initialBbl: "2", brewedOn: "2026-10-01",
      sources: [], actuals: [{ key: "1", source: "", stage: "dry_hop", qty: "" }], process: {},
    } }));
    expect(brew).toMatch(/>Dry hop</);
    expect(brew).not.toMatch(/>dry_hop</);
  });

  it("brew day's plan and recorded rows name the stage as the pick does", () => {
    const ingredient = { id: "i", material_id: "citra", materialName: "Citra", unit: "lb", stage: "dry_hop" as const, per_bbl_qty: 1.2 };
    const planned = html(createElement(BrewDayView, { model: {
      title: "Batch", vesselId: "v", vessels: [], initialBbl: "2", brewedOn: "2026-10-01", plan: { ingredients: [ingredient] },
    } }));
    expect(planned).toContain("1.2 lb per bbl · Dry hop");
    const recorded = html(createElement(BrewDayView, { model: {
      title: "Batch", vesselId: "", vessels: [], initialBbl: "2", brewedOn: "2026-10-01", recorded: true,
      records: [{ id: "r", turn: 1, initial_bbl: 2, brewed_on: "2026-10-01", created_at: "2026-10-01", correction_reason: null, corrects_id: null, plan_snapshot: {}, process: {},
        additions: [{ id: "a", material_name: "Citra", unit: "lb", confirmed_qty: 2, stage: "dry_hop", recipe_ingredient_id: null, lot_code: null, location_name: "Cellar", bin_name: "Cold", source: { material_id: "citra", location_id: "c", bin_id: "b", lot_id: null } }] }],
    } }));
    expect(recorded).toContain("2 lb · Dry hop · Untracked");
    expect(planned + recorded).not.toContain("dry_hop");
  });
});
