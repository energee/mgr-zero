// components/mgr/views/ingredient.tsx — Ingredient (one line of a recipe
// version): the material, the stage it enters at, its quantity per barrel
// and an optional timing. Inventory draws a fixture with no onChange; the
// live sheet (recipes/[id]/schedule-sheets.tsx) edits a draft version.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { INGREDIENT_STAGES } from "@/lib/commands/production";

export type IngredientFields = { material: string; stage: string; perBbl: string; timing: string };
export const INGREDIENT_STAGE_LABELS = INGREDIENT_STAGES.map((s) => s.replace("_", " "));

export function IngredientView({ fields, materials, onChange, footer }: {
  fields: IngredientFields; materials: string[]; onChange?: (patch: Partial<IngredientFields>) => void; footer?: ReactNode;
}) {
  const bind = <K extends keyof IngredientFields>(key: K) => onChange && { onChange: (value: string) => onChange({ [key]: value } as Partial<IngredientFields>) };
  return <>
    {E.pick("Material", fields.material, materials, bind("material"))}
    {E.pick("Stage", fields.stage, INGREDIENT_STAGE_LABELS, bind("stage"))}
    {E.cols(
      E.edit("Per bbl", fields.perBbl, "number", undefined, bind("perBbl")),
      E.edit("Timing min · optional", fields.timing, "number", undefined, bind("timing")),
    )}
    {footer !== undefined ? footer : E.btns([["Delete ingredient", "g"], "Save ingredient"])}
  </>;
}
