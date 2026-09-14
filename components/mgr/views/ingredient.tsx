// components/mgr/views/ingredient.tsx — Ingredient (one line of a recipe
// version): the material, the stage it enters at, its quantity per barrel
// and an optional timing. Inventory draws a fixture with no onChange; the
// live sheet (recipes/[id]/schedule-sheets.tsx) edits a draft version.
// Material and stage are picked by id and enum value; the labels are display.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { INGREDIENT_STAGES } from "@/lib/mgr/recipe-process-view";

export type IngredientFields = { material: string; stage: string; perBbl: string; timing: string };
export type IngredientMaterial = { id: string; name: string };
export const INGREDIENT_STAGE_OPTIONS = INGREDIENT_STAGES.map((s) => ({ value: s, label: s.replace("_", " ") }));

export function IngredientView({ fields, materials, onChange, footer }: {
  fields: IngredientFields; materials: IngredientMaterial[]; onChange?: (patch: Partial<IngredientFields>) => void; footer?: ReactNode;
}) {
  const bind = <K extends keyof IngredientFields>(key: K) => onChange && { onChange: (value: string) => onChange({ [key]: value } as Partial<IngredientFields>) };
  return <>
    {E.pick("Material", fields.material, materials.map((m) => ({ value: m.id, label: m.name })), bind("material"))}
    {E.pick("Stage", fields.stage, INGREDIENT_STAGE_OPTIONS, bind("stage"))}
    {E.cols(
      E.edit("Per bbl", fields.perBbl, "number", undefined, bind("perBbl")),
      E.edit("Timing min · optional", fields.timing, "number", undefined, bind("timing")),
    )}
    {footer !== undefined ? footer : E.btns([["Delete ingredient", "g"], "Save ingredient"])}
  </>;
}
