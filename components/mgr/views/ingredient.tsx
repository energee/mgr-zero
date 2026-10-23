// components/mgr/views/ingredient.tsx — Ingredient (one line of a recipe
// version): the material, the stage it enters at, its quantity per barrel in
// the material's own unit (a line never invents one), and an optional timing.
// Inventory draws a fixture with no onChange; the live sheet
// (recipes/[id]/schedule-sheets.tsx) edits a draft version. Material and
// stage are picked by id and enum value; the labels are display. Material is
// a searchable picker (E.searchPick), since a brewery's material list outgrows
// a Select; an option reads "name · category" when the category is known. With
// no materials it links to Materials, which recipe editors (Admin, Brewer) may
// add to (#1123).
"use client";
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { sentenceCase } from "@/lib/mgr/labels";
import { noMaterialsPick } from "@/lib/mgr/materials-view";
import { INGREDIENT_STAGES, type IngredientLine } from "@/lib/mgr/recipe-process-view";

export type IngredientFields = IngredientLine;
/** `unit` is the material's base unit as the command returns it; absent until a material is picked.
 *  `category` (hop, malt…) is shown beside the name when present. */
export type IngredientMaterial = { id: string; name: string; unit?: string; category?: string };
/** The Stage pick's options, here and on Brew day: the stored value, shown in sentence case ("dry_hop" reads "Dry hop"). */
export const INGREDIENT_STAGE_OPTIONS = INGREDIENT_STAGES.map((s) => ({ value: s, label: sentenceCase(s) }));

export function IngredientView({ fields, materials, onChange, footer }: {
  fields: IngredientFields; materials: IngredientMaterial[]; onChange?: (patch: Partial<IngredientFields>) => void; footer?: ReactNode;
}) {
  const bind = (key: keyof IngredientFields) => onChange && { onChange: (value: string) => onChange({ [key]: value } as Partial<IngredientFields>) };
  const id = useId();
  const unit = materials.find((m) => m.id === fields.materialId)?.unit;
  const qtyLabel = unit ? `Quantity per bbl (${unit})` : "Quantity per bbl";
  return <>
    {E.searchPick("Material", fields.materialId, materials.map((m) => ({ value: m.id, label: m.category ? `${m.name} · ${m.category}` : m.name })), { id: `${id}-material`, placeholder: "Choose a material", empty: noMaterialsPick("/materials"), ...bind("materialId") })}
    {E.pick("Stage", fields.stage, INGREDIENT_STAGE_OPTIONS, bind("stage"))}
    {E.inline(
      E.qty(fields.perBblQty, unit ? `${unit} / bbl` : "/ bbl", qtyLabel, `${id}-qty`, bind("perBblQty")),
      E.edit("Timing min · optional", fields.timingMinutes, "number", undefined, bind("timingMinutes")),
    )}
    {footer !== undefined ? footer : E.btns([["Delete ingredient", "g"], "Save ingredient"])}
  </>;
}
