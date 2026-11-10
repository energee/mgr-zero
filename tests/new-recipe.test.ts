// tests/new-recipe.test.ts — a recipe is created on the Recipe surface, not
// on a page of its own: the parent fields (name, optional brand and note) are one shared component, drawn in RecipeView's
// parentForm slot by the live editor when it has no recipe yet. The inventory Recipe record draws the saved recipe. /recipes/new is that editor; one save writes create_recipe
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
import { RecipeNumbersView } from "../components/mgr/views/recipe-numbers";
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

  it("the creating state draws the parent fields in RecipeView's parentForm slot, above the same sheet, and has no screen of its own", () => {
    // The inventory record draws the saved recipe: its brand is a pick in its sentence, so it mounts no parent fields.
    const body = screen("Recipe").body as { type: unknown; props: { parentForm?: unknown } };
    expect(body.type).toBe(RecipeView);
    expect(body.props.parentForm).toBeUndefined();
    const creating = renderToStaticMarkup(createElement(RecipeView, {
      model: { title: "New recipe", notes: "" }, parentForm: createElement(NewRecipeFieldsView, { brands: [{ id: "b1", name: "Hazy IPA" }] }),
      controls: { setNote: () => {}, onSubmit: () => {}, dirty: true, submitLabel: "Create recipe" },
    }));
    const at = (words: string) => creating.indexOf(words);
    expect(at(">Name<")).toBeGreaterThan(at("</h1>"));
    expect(at("Brand · optional")).toBeGreaterThan(at(">Name<"));
    expect(at("Note · optional")).toBeGreaterThan(at("Brand · optional"));
    expect(at("Assumes ")).toBeGreaterThan(at("Note · optional"));
    // The brand is picked in the fields, so the sentence under them holds no second pick.
    expect(creating.match(/role="combobox"/g)).toHaveLength(1);
    expect(screen("New recipe")).toBeUndefined();
    expect(SCREEN_ROUTES.find((r) => r.name === "New recipe")).toBeUndefined();
    expect(resolveTap(screen("Recipes"), "New recipe")).toBe("Recipe");
  });

  it("bounds the process numbers as create_recipe_version does, so the browser refuses them first (#447)", () => {
    const sheet = renderToStaticMarkup(createElement(RecipeNumbersView, { values: {}, onChange: () => {} }));
    const input = (label: string) => new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`).exec(sheet)?.[0] ?? "";
    expect(input("Boil time min")).toMatch(/min="1"[^>]*step="1"|step="1"[^>]*min="1"/);
    expect(input("Whirlpool min")).toMatch(/min="0"/);
    expect(input("Whirlpool min")).toMatch(/step="1"/);
    expect(input("Whirlpool rest min")).toMatch(/step="1"/);
    expect(input("Pre-boil volume bbl")).toMatch(/min="0.01"/);
    // The batch size takes what a saved copy can store: above zero, at most 9,999,999.999.
    expect(input("Batch size bbl")).toMatch(/min="0\.001"/);
    expect(input("Batch size bbl")).toMatch(/max="9999999\.999"/);
  });

  it("RecipeView is the one editor: controlled when given controls, static for the fixture", () => {
    const fixture = renderToStaticMarkup(createElement(RecipeView, { model: recipeHazyV4 }));
    expect(fixture).not.toMatch(/<form\b/);
    // The fixture is the saved recipe with no unsaved change: no save bar, and no verb that names a version.
    expect(fixture).not.toMatch(/New recipe version|Save changes/);
    const live = renderToStaticMarkup(createElement(RecipeView, { model: { title: "New recipe", preBoil: "16.8", notes: "Less crystal" }, controls: { setNote: () => {}, onSubmit: () => {}, dirty: true, submitLabel: "Create recipe" } }));
    expect(live).toMatch(/<form\b/);
    // The change note is the page's one field; the numbers read as text that opens their sheet.
    expect(live).toMatch(/<input[^>]*aria-label="Change note · optional"[^>]*value="Less crystal"/);
    expect(live).toMatch(/Boil from <button[^>]*>16\.8 bbl<span class="sr-only">, edit recipe numbers<\/span><\/button>\./);
    expect(live).toMatch(/<button[^>]*type="submit"[^>]*>Create recipe</);
    // The Recipe numbers sheet holds the fields, each under its own label.
    const sheet = renderToStaticMarkup(createElement(RecipeNumbersView, { values: { preBoil: "16.8" }, onChange: () => {} }));
    expect(sheet).toMatch(/<label[^>]*>Pre-boil volume bbl<\/label>/);
    expect(sheet).toMatch(/<input[^>]*aria-label="Pre-boil volume bbl"[^>]*value="16.8"/);
    // A saved copy read only is text and drawings, with nothing that edits it.
    const cut = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Hazy", preBoil: "16.8", mashSchedule: [{ name: "Sacch", kind: "infusion", tempF: 152, minutes: 60 }] } }));
    expect(cut).toContain("152 °F");
    expect(cut).toContain("Boil from 16.8 bbl.");
    expect(cut).not.toMatch(/<form\b|<button|Add ingredient|Edit schedule|Open/);
    // No scale chips: they previewed a batch size nothing supplies.
    expect(fixture).not.toMatch(/15 bbl|30 bbl/);
    // Not written yet: no number is invented, and nothing says "version".
    const none = renderToStaticMarkup(createElement(RecipeView, { readOnly: true, model: { title: "Hazy" } }));
    expect(none).not.toMatch(/No version yet|Pre-boil volume|Assumes/);
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

    it("takes a count of packs beside the per-barrel amount, when the recipe has a batch size and the material a pack size", () => {
      const pils = { id: "pils", name: "Pilsner malt", unit: "lb", category: "malt", packSize: 55, packName: "bag" as const };
      const sheet = (batchBbl: number | undefined, material: Omit<typeof pils, "packName"> & { packName?: "bag" } = pils) => renderToStaticMarkup(createElement(IngredientView, { fields: { materialId: "pils", stage: "mash", perBblQty: "57.5", timing: "" }, materials: [material], batchBbl }));
      const html = sheet(22);
      expect(html).toMatch(/<label[^>]*>Bags \(55 lb\) for 22 bbl<\/label>/);
      expect(html).toMatch(/<input[^>]*aria-label="Bags \(55 lb\) for 22 bbl"[^>]*value="23"/);
      // The per-barrel field stays, after the count.
      expect(html).toMatch(/<input[^>]*aria-label="Quantity per bbl \(lb\)"[^>]*value="57.5"/);
      expect(html.indexOf("for 22 bbl")).toBeLessThan(html.indexOf("Quantity per bbl"));
      // No pack word: the count is of packs.
      expect(sheet(22, { ...pils, packSize: 50, packName: null as never })).toContain("Packs (50 lb) for 22 bbl");
      // No batch size, or a material with no pack size: per barrel only.
      for (const without of [sheet(undefined), sheet(0), sheet(22, { ...pils, packSize: 1, packName: undefined })]) expect(without).not.toMatch(/bbl<\/label>[^]*bbl<\/label>|Bags \(|Packs \(/);
    });

    it("the material trigger acts in place on the Ingredient record", () => {
      expect(isInertOn(screen("Ingredient"), "Material")).toBe(true);
      expect(isInertOn(screen("Cycle count"), "Material")).toBe(false);
    });
  });

  describe("the read-out and the draft blocker (plan task 8)", () => {
    const versioned = { title: "Hazy", preBoil: "16.8", efficiency: "72.5", notes: "", ingredients: [{ key: "m", title: "2-row", amount: "40.9 lb", timing: "", timingMinutes: null, stage: "mash" as const }] };
    const draw = (props: Parameters<typeof RecipeView>[0]) => renderToStaticMarkup(createElement(RecipeView, props));
    const draft = (blockedReason?: string) => draw({ model: { title: "Hazy", notes: "" }, controls: { setNote: () => {}, onSubmit: () => {}, dirty: true, blockedReason } });

    it("a saved copy read only shows its numbers as text, with no input", () => {
      const cut = draw({ readOnly: true, model: versioned }).replace(/<[^>]+>/g, "");
      expect(cut).toContain("Assumes 72.5% efficiency and no attenuation.");
      expect(cut).toContain("Boil from 16.8 bbl.");
      expect(draw({ readOnly: true, model: versioned })).not.toMatch(/<input|<button/);
      // Only the numbers the copy holds are read out.
      expect(cut).not.toMatch(/Boil time|Whirlpool|Knock out/);
    });

    it("the title row holds Schedule batch once the recipe is saved, read-only or not, and never a version verb", () => {
      for (const readOnly of [true, false]) {
        const html = draw({ model: { ...versioned, saved: "Aug 28, 2026", scheduleHref: "/batches?recipe=x" }, readOnly, parentForm: createElement("p", null, "PARENT") });
        expect(html.match(/Schedule batch/g)).toHaveLength(1);
        const verb = html.indexOf("Schedule batch");
        expect(verb).toBeGreaterThan(html.indexOf("</h1>"));
        expect(verb).toBeLessThan(html.indexOf("PARENT"));
        expect(html).toMatch(/href="\/batches\?recipe=x"/);
        expect(html).not.toContain("New recipe version");
      }
      // Not saved yet: nothing to schedule, so the title row has no verb.
      expect(draw({ model: versioned, readOnly: true })).not.toContain("Schedule batch");
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

    it("draws no table or Batch actuals heading without brewed batches", () => {
      const html = draw({ readOnly: true, model: versioned });
      expect(html).not.toMatch(/<table\b/);
      expect(html).not.toContain("Batch actuals");
      expect(draw({ model: recipeHazyV4 })).toMatch(/<table\b/);
    });

    it("shows the recipe note and the saved date with its change note in one sentence, over the day's two lists", () => {
      const html = draw({ readOnly: true, model: { ...versioned, recipeNote: "House IPA", saved: "Aug 28, 2026 · Knock out cold" } });
      // The recipe's own note, then the saved date and that save's change note.
      expect(html).toContain("House IPA. Saved Aug 28, 2026 · Knock out cold.");
      expect([...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Goes in on brew day"]);
      expect(draw({ readOnly: true, model: versioned })).not.toMatch(/Saved|Change note/);
      expect(draft()).toMatch(/aria-label="Change note · optional"|>Change note · optional</);
    });
  });

  it("/recipes/new and /recipes/[id] draw the editor through RecipeView, never a detail override", () => {
    expect(src("app/(app)/recipes/new/page.tsx")).toMatch(/<RecipeEditor\b/);
    const detail = src("app/(app)/recipes/[id]/page.tsx");
    // The recipe's own page is the editor; an earlier copy is the same view read only.
    expect(detail).toMatch(/<RecipeEditor\b/);
    expect(detail).toMatch(/<RecipeView readOnly\b/);
    // As brewed and Use this again use search params; the removed alternate detail drawing must stay gone.
    expect(detail).not.toMatch(/detail=/);
    // The editor starts as the current saved copy, and a change left in this tab comes back.
    expect(detail).toMatch(/const initial = versionToDraft\(snapshot\)/);
    const form = src("app/(app)/recipes/[id]/recipe-version-form.tsx");
    expect(form).toMatch(/\breadRecipeDraft\b[^]*\bwriteRecipeDraft\b|\bwriteRecipeDraft\b[^]*\breadRecipeDraft\b/);
    expect(form).toMatch(/import \{[^}]*\breadRecipeDraft\b[^}]*\} from "@\/lib\/mgr\/recipe-draft"/);
    expect(form).toMatch(/import \{[^}]*\bwriteRecipeDraft\b[^}]*\} from "@\/lib\/mgr\/recipe-draft"/);
    expect(form).toMatch(/<RecipeView\b/);
    expect(form).toMatch(/<NewRecipeFieldsView\b/);
    // The save bar is up only while the sheet differs from what is saved (always while creating), and Discard puts it back.
    expect(form).toMatch(/const dirty = creating \|\| shouldKeepDraft\(start, draft\)/);
    expect(form).toMatch(/onDiscard: creating \? undefined : discard/);
    // An unchanged saved sheet offers Refresh from Materials when its live preview differs from what the copy froze,
    // and never guesses when it cannot see a line's material.
    expect(form).toMatch(/materialsNowGive\(savedFigures, lines\.every\(\(l\) => material\.get\(l\.materialId\)\) \? live : null, unit\)/);
    expect(form).toMatch(/refresh: refreshText \? \{ text: refreshText, onRefresh: \(\) => void submit\(\) \} : undefined/);
    // The batch size is part of the sheet: sent with every save (blank sends none), and checked before it.
    expect(form).toMatch(/process: \{ batchBbl: num\(batchBbl\),/);
    expect(form).toMatch(/draftBlocker\(\{[^}]*\bbatchBbl\b/);
    // The Ingredient sheet gets the batch size and each material's pack, so a line can be typed in packs.
    expect(form).toMatch(/batchBbl: batchSize\(batchBbl\)/);
    expect(form).toMatch(/packSize: Number\(m\.purchase_uom_factor\), packName: m\.pack_name/);
    // Nothing the editor says to the brewer names a version.
    expect(form).not.toMatch(/["`][^"`\n]*\bversions?\b[^"`\n]*["`]/i);
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

  it("each column's add-ingredient action reads like every other create action", () => {
    const draft = html(createElement(RecipeView, { model: { title: "Hazy", notes: "" } })).replace(/<[^>]+>/g, "");
    expect(draft).toContain("Add ingredient to brew day");
    expect(draft).toContain("Add ingredient to the cellar");
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

  it("fermentation names an empty schedule in one line (#1263)", () => {
    const schedule = html(createElement(FermentationScheduleView, { stages: [] }));
    expect(schedule).toContain("No stages yet");
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
    expect(planned).toContain(">Dry hop<");
    expect(planned).toContain("1.2 lb / bbl");
    const recorded = html(createElement(BrewDayView, { model: {
      title: "Batch", vesselId: "", vessels: [], initialBbl: "2", brewedOn: "2026-10-01", recorded: true,
      records: [{ id: "r", turn: 1, initial_bbl: 2, brewed_on: "2026-10-01", created_at: "2026-10-01", correction_reason: null, corrects_id: null, plan_snapshot: {}, process: {},
        additions: [{ id: "a", material_name: "Citra", unit: "lb", confirmed_qty: 2, stage: "dry_hop", recipe_ingredient_id: null, lot_code: null, location_name: "Cellar", bin_name: "Cold", source: { material_id: "citra", location_id: "c", bin_id: "b", lot_id: null } }] }],
    } }));
    expect(recorded).toContain("2 lb · Dry hop · Untracked");
    expect(planned + recorded).not.toContain("dry_hop");
  });
});
