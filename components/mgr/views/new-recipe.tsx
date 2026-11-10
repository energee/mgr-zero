// components/mgr/views/new-recipe.tsx — the recipe parent fields: what a
// recipe is before its sheet is saved. Name, and the brand it is meant to
// brew and a note, both optional; the brand's hint sits under its picker. Fields only, no
// form or layout of their own (RecipeView's band lays them out side by side): the inventory Recipe
// record mounts them in RecipeView's parentForm slot and the live editor
// (app/(app)/recipes/[id]/recipe-version-form.tsx) draws them above the
// blank sheet so one save creates both.
"use client";

import { nameWithAlias } from "@/lib/mgr/labels";
import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { NONE } from "@/components/ui/select";

export type NewRecipeValues = { name: string; brandId: string; note: string };
export type NewRecipeBrand = { id: string; name: string; alias?: string | null };
export const BLANK_RECIPE: NewRecipeValues = { name: "", brandId: "", note: "" };

export function NewRecipeFieldsView({ brands, values, onChange, busy = false }: {
  brands: NewRecipeBrand[];
  values?: NewRecipeValues;
  onChange?: (values: NewRecipeValues) => void;
  busy?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(values ?? BLANK_RECIPE);
  const v = onChange ? (values ?? draft) : draft;
  const set = (patch: Partial<NewRecipeValues>) => { const next = { ...v, ...patch }; setDraft(next); onChange?.(next); };
  return (
    <>
      {E.edit("Name", v.name, "text", undefined, { onChange: (nextValue: string) => set({ name: nextValue }), id: `${id}-name`, disabled: busy, required: true })}
      {E.pick("Brand · optional", v.brandId || NONE, [{ value: NONE, label: "Not decided" }, ...(brands.map((b) => ({ value: b.id, label: nameWithAlias(b) })))], { onChange: (x) => set({ brandId: x === NONE ? "" : x }), disabled: busy, description: <FieldDescription>Pick the brand this recipe brews, or leave it undecided. Packaging always asks for the brand.</FieldDescription> })}
      {E.edit("Note · optional", v.note, "text", undefined, { onChange: (nextValue: string) => set({ note: nextValue }), id: `${id}-note`, disabled: busy })}
    </>
  );
}
