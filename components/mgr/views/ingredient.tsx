// components/mgr/views/ingredient.tsx — Ingredient (one line of a recipe
// version): the material, the stage it enters at, its quantity per barrel in
// the material's own unit (a line never invents one), and an optional timing.
// Inventory draws a fixture with no onChange; the live sheet
// (recipes/[id]/schedule-sheets.tsx) edits a draft version. Material and
// stage are picked by id and enum value; the labels are display. Material is
// a searchable picker (E.searchPick), since a brewery's material list outgrows
// a Select; an option reads "name · category" when the category is known. With
// no materials it opens Materials in a new tab, keeping both drafts mounted.
// Recipe editors (Admin, Brewer) may add materials there (#1123, #1384).
"use client";
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormFooter } from "@/components/mgr/command-form";
import { sentenceCase } from "@/lib/mgr/labels";
import { noMaterialsPick } from "@/lib/mgr/materials-view";
import { ingredientReason, INGREDIENT_STAGES, timedInDays, type IngredientFields, type TimingLimits } from "@/lib/mgr/recipe-process-view";

export type { IngredientFields };
/** `unit` is the material's base unit as the command returns it; absent until a material is picked.
 *  `category` (hop, malt…) is shown beside the name when present. */
export type IngredientMaterial = { id: string; name: string; unit?: string; category?: string };
/** The Stage pick's options, here and on Brew day: the stored value, shown in sentence case ("dry_hop" reads "Dry hop"). */
export const INGREDIENT_STAGE_OPTIONS = INGREDIENT_STAGES.map((s) => ({ value: s, label: sentenceCase(s) }));

/** No boil time and no schedule: the one-day and 120-day ceilings. */
const DEFAULT_LIMITS: TimingLimits = { fermentationDays: 0 };

export function IngredientView({ fields, materials, limits = DEFAULT_LIMITS, onChange, onSave, onDelete, footer }: {
  fields: IngredientFields; materials: IngredientMaterial[];
  /** The draft's boil time and fermentation schedule length, which bound the timing (#1478). */
  limits?: TimingLimits;
  onChange?: (patch: Partial<IngredientFields>) => void; onSave?: () => void; onDelete?: (() => void) | null; footer?: ReactNode;
}) {
  const bind = (key: keyof IngredientFields) => onChange && { onChange: (value: string) => onChange({ [key]: value } as Partial<IngredientFields>) };
  const id = useId();
  const unit = materials.find((m) => m.id === fields.materialId)?.unit;
  const qtyLabel = unit ? `Quantity per bbl (${unit})` : "Quantity per bbl";
  return <>
    {E.searchPick("Material", fields.materialId, materials.map((m) => ({ value: m.id, label: m.category ? `${m.name} · ${m.category}` : m.name })), { id: `${id}-material`, placeholder: "Choose a material", empty: onChange ? { ...noMaterialsPick("/materials"), label: "Add a material (opens in a new tab)", target: "_blank" } : noMaterialsPick(), ...bind("materialId") })}
    {E.pick("Stage", fields.stage, INGREDIENT_STAGE_OPTIONS, bind("stage"))}
    {E.inline(
      E.edit(qtyLabel, fields.perBblQty, "number", undefined, { id: `${id}-qty`, ...bind("perBblQty") }),
      // Fermentation and dry hop count days from the start of fermentation; other stages count minutes.
      E.edit(timedInDays(fields.stage) ? "Timing day · optional" : "Timing min · optional", fields.timing, "number", undefined, bind("timing")),
    )}
    {footer !== undefined ? footer : <CommandFormFooter>
      {onDelete !== null && <Button type="button" variant="outline" onClick={onDelete}>Delete ingredient</Button>}
      {E.submit("Save ingredient", { type: "button", reason: ingredientReason(fields, limits), onClick: onSave })}
    </CommandFormFooter>}
  </>;
}
