// app/(app)/recipes/[id]/recipe-version-form.tsx — the live draft of a
// recipe version: RecipeView (components/mgr/views/recipe.tsx) with every
// field controlled, the ingredient, mash, fermentation and water rows opening
// their sheets (schedule-sheets.tsx), and the OG/FG/ABV preview from the same
// pure recipeGravity the server uses (lib/recipe-gravity.ts). With a recipeId
// the bottom button runs create_recipe_version; without one (recipes/new) the
// shared parent fields sit on top and one save runs create_recipe then
// create_recipe_version, landing on the recipe. Efficiency and attenuation
// are typed as percents, as the inventory draws them, and sent as fractions.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { E } from "@/components/mgr/e";
import { RecipeView } from "@/components/mgr/views/recipe";
import { BLANK_RECIPE, NewRecipeFieldsView, type NewRecipeBrand } from "@/components/mgr/views/new-recipe";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { recipeGravity } from "@/lib/recipe-gravity";
import { RECIPE_NUMBERS, type RecipeNumberKey } from "@/lib/mgr/recipe-view";
import { EMPTY_WATER, fermentationSummary, ingredientDetail, lineReady, mashSummary, materialLookup, optionalNumber as num, removeAt, upsertAt, type FermentationStage, type IngredientLine, type MashStep, type WaterDraft, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import { FermentationScheduleSheet, IngredientSheet, MashScheduleSheet, WaterSheet } from "./schedule-sheets";

/** The material fields the editor reads; both recipe pages project list_materials to this. */
export type RecipeMaterial = { id: string; name: string; category: string; base_uom: string; extract_potential: number | null };
export const toRecipeMaterial = ({ id, name, category, base_uom, extract_potential }: RecipeMaterial): RecipeMaterial => ({ id, name, category, base_uom, extract_potential });
type Numbers = Record<RecipeNumberKey, string>;

const DEFAULT_MASH: MashStep[] = [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }];
const DEFAULTS: Partial<Numbers> = { efficiency: "75", attenuation: "78" };
const BLANK_NUMBERS = Object.fromEntries(RECIPE_NUMBERS.map(([k]) => [k, DEFAULTS[k] ?? ""])) as Numbers;
const pctToFraction = (s: string) => Number(s) / 100;

export function RecipeEditor({ recipeId, title, backHref, backLabel, brands = [], materials, profiles, unit }: {
  recipeId?: string; title: string; backHref: string; backLabel?: string; brands?: NewRecipeBrand[]; materials: RecipeMaterial[]; profiles: WaterProfileIons[]; unit: GravityUnit;
}) {
  const router = useRouter();
  const action = useCommandAction();
  const [parent, setParent] = useState(BLANK_RECIPE);
  const [numbers, setNumbers] = useState(BLANK_NUMBERS);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<IngredientLine[]>([]);
  const [mashSchedule, setMashSchedule] = useState<MashStep[]>(DEFAULT_MASH);
  const [fermentationSchedule, setFermentationSchedule] = useState<FermentationStage[]>([]);
  const [water, setWater] = useState<WaterDraft>(EMPTY_WATER);

  const validLines = lines.filter(lineReady);
  const eff = pctToFraction(numbers.efficiency), att = pctToFraction(numbers.attenuation);
  const build = (id: string) => ({
    recipeId: id, mashSchedule, fermentationSchedule,
    process: { preBoilBbl: num(numbers.preBoil), whirlpoolMinutes: num(numbers.whirlpoolMin), whirlpoolTempF: num(numbers.whirlpoolTemp), whirlpoolRestMinutes: num(numbers.whirlpoolRest), knockoutTempF: num(numbers.knockoutTemp) },
    water: { targetProfileId: water.targetProfileId || undefined, sourceProfileId: water.sourceProfileId || undefined, mashGal: num(water.mashGal), spargeGal: num(water.spargeGal), targetMashPh: num(water.targetMashPh), additions: water.additions },
    brewhouseEfficiency: eff, yeastAttenuation: att,
    boilMinutes: num(numbers.boilMin), note: notes || undefined,
    ingredients: validLines.map((l) => ({ materialId: l.materialId, perBblQty: Number(l.perBblQty), stage: l.stage, timingMinutes: l.timingMinutes ? Number(l.timingMinutes) : undefined })),
  });

  // Recomputed every render: a handful of numbers. Null (no "Predicted:"
  // line) until every mash ingredient's material has an extract_potential.
  const preview = eff > 0 && eff <= 1 && att > 0 && att <= 1 && validLines.length > 0
    ? recipeGravity({ brewhouseEfficiency: eff, yeastAttenuation: att, ingredients: validLines.map((l) => ({ perBblQty: Number(l.perBblQty), extractPotential: material.get(l.materialId)?.extract_potential ?? null, stage: l.stage })) })
    : null;

  const creating = recipeId === undefined;
  // A parent that saved before the version failed is kept, so a retry writes
  // only the version instead of a second recipe; the parent fields lock at
  // that point, since there is no update_recipe to carry a later edit.
  const [createdId, setCreatedId] = useState(recipeId ?? "");
  async function submit() {
    let id = createdId;
    if (!id) {
      const ok = await action.run("create_recipe", { name: parent.name, brandId: parent.brandId || undefined, note: parent.note || undefined }, (d) => {
        const got = (d as { id?: unknown } | null)?.id;
        if (typeof got === "string") { id = got; setCreatedId(got); }
      });
      if (!ok) return;
      if (!id) { action.setError("The recipe was created but its id did not come back; open it from Recipes to add the version."); return; }
    }
    await action.run("create_recipe_version", build(id), () => router.push(`/recipes/${id}`));
  }
  const ready = mashSchedule.length > 0 && eff > 0 && eff <= 1 && att > 0 && att <= 1 && validLines.length > 0 && (!creating || parent.name.trim() !== "");
  const parentLocked = creating && createdId !== "";
  // Plain values: the React Compiler memoizes these on `materials` itself.
  const material = materialLookup(materials);
  const sheetMaterials = materials.map((m) => ({ id: m.id, name: m.name, unit: m.base_uom }));
  const target = profiles.find((p) => p.id === water.targetProfileId)?.name;
  const mashRow = { title: `Mash schedule · ${mashSchedule.length} steps`, detail: mashSummary(mashSchedule) };
  const fermentationRow = { title: `Fermentation schedule · ${fermentationSchedule.length} stages`, detail: fermentationSummary(fermentationSchedule) };
  const waterRow = { title: `Water · ${target ? `target ${target}` : "no target"}`, detail: `${water.additions.length} additions` };

  return (
    <RecipeView
      model={{
        title, backHref, backLabel, ...numbers, notes,
        ingredients: lines.map((l, i) => ({
          key: `${i}-${l.materialId}`, title: material.name(l.materialId), detail: ingredientDetail(l.stage, l.timingMinutes, l.perBblQty, material.unit(l.materialId)), qty: "",
          action: <IngredientSheet line={l} materials={sheetMaterials} onSave={(f) => setLines((prev) => upsertAt(prev, i, f))} onDelete={() => setLines((prev) => removeAt(prev, i))} trigger={E.act("Edit")} />,
        })),
        mash: mashRow, fermentation: fermentationRow, water: waterRow,
        predicted: preview ? `Predicted: OG ${formatGravity(preview.ogPlato, unit)} · FG ${formatGravity(preview.fgPlato, unit)} · ABV ${preview.abv.toFixed(1)}%` : undefined,
      }}
      parentForm={creating ? <>
        <NewRecipeFieldsView brands={brands} values={parent} onChange={setParent} busy={action.busy || parentLocked} />
        {parentLocked ? E.info("The recipe is saved under this name; only the version is still to write.") : null}
      </> : undefined}
      controls={{
        set: (key, value) => key === "notes" ? setNotes(value) : setNumbers((n) => ({ ...n, [key]: value })),
        onSubmit: () => void submit(), busy: action.busy, ready, error: action.error,
        submitLabel: creating && !parentLocked ? "Create recipe" : "Create recipe version",
      }}
      slots={{
        addIngredient: <IngredientSheet materials={sheetMaterials} onSave={(f) => setLines((prev) => [...prev, f])} trigger={E.row("+ add ingredient", "material · stage · timing", "")} />,
        mash: <MashScheduleSheet steps={mashSchedule} onChange={setMashSchedule} trigger={E.nav(mashRow.title, mashRow.detail)} />,
        fermentation: <FermentationScheduleSheet stages={fermentationSchedule} onChange={setFermentationSchedule} trigger={E.nav(fermentationRow.title, fermentationRow.detail)} />,
        water: <WaterSheet water={water} profiles={profiles} materials={materials} onChange={setWater} trigger={E.nav(waterRow.title, waterRow.detail)} />,
      }}
    />
  );
}
