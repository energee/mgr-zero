// components/mgr/views/ingredient.tsx — Ingredient (one line of a recipe
// version): the material, the stage it enters at, its quantity per barrel in
// the material's own unit (a line never invents one), and an optional timing.
// Inventory draws a fixture with no onChange; the live sheet
// (recipes/[id]/schedule-sheets.tsx) edits a draft version. Material and
// stage are picked by id and enum value; the labels are display.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { INGREDIENT_STAGES } from "@/lib/mgr/recipe-process-view";

export type IngredientFields = { material: string; stage: string; perBbl: string; timing: string };
/** `unit` is the material's base unit as the command returns it; absent until a material is picked. */
export type IngredientMaterial = { id: string; name: string; unit?: string };
export const INGREDIENT_STAGE_OPTIONS = INGREDIENT_STAGES.map((s) => ({ value: s, label: s.replace("_", " ") }));

export function IngredientView({ fields, materials, onChange, footer }: {
  fields: IngredientFields; materials: IngredientMaterial[]; onChange?: (patch: Partial<IngredientFields>) => void; footer?: ReactNode;
}) {
  const bind = <K extends keyof IngredientFields>(key: K) => onChange && { onChange: (value: string) => onChange({ [key]: value } as Partial<IngredientFields>) };
  const unit = materials.find((m) => m.id === fields.material)?.unit;
  return <>
    {E.pick("Material", fields.material, materials.map((m) => ({ value: m.id, label: m.name })), bind("material"))}
    {E.pick("Stage", fields.stage, INGREDIENT_STAGE_OPTIONS, bind("stage"))}
    {E.inline(
      <Field>
        <FieldLabel>Quantity per bbl</FieldLabel>
        {E.qty(fields.perBbl, unit ? `${unit} / bbl` : "/ bbl", "Quantity per bbl", undefined, onChange && ((value) => onChange({ perBbl: value })))}
      </Field>,
      E.edit("Timing min · optional", fields.timing, "number", undefined, bind("timing")),
    )}
    {footer !== undefined ? footer : E.btns([["Delete ingredient", "g"], "Save ingredient"])}
  </>;
}
