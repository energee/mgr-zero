// components/mgr/views/new-recipe.tsx — the recipe parent fields: what a
// recipe is before its sheet is saved. Name, and the brand it is meant to
// brew and a note, both optional; the brand's hint sits under its picker. Fields only, no
// form or layout of their own (RecipeView's parentForm row lays them out side by side): the live editor
// (app/(app)/recipes/[id]/recipe-version-form.tsx) draws them there, above the
// blank sheet, so one save creates both. A saved recipe has no such fields: its
// brand is a pick in the page's sentence, and its name and note are edited in
// the Recipe name sheet (RecipeNameView): the same two fields without the
// brand, over their Save. The inventory draws it with no onSave; the live sheet
// (recipes/[id]/schedule-sheets.tsx) runs update_recipe.
"use client";

import { nameWithAlias } from "@/lib/mgr/labels";
import { useId, useState } from "react";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { NONE } from "@/components/ui/select";

export type NewRecipeValues = { name: string; brandId: string; note: string };
export type NewRecipeBrand = { id: string; name: string; alias?: string | null };
export const BLANK_RECIPE: NewRecipeValues = { name: "", brandId: "", note: "" };

export function NewRecipeFieldsView({ brands, values, onChange, busy = false }: {
  /** The brands to pick from; omitted, there is no Brand field (the Recipe name sheet). */
  brands?: NewRecipeBrand[];
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
      {brands ? E.pick("Brand · optional", v.brandId || NONE, [{ value: NONE, label: "Not decided" }, ...(brands.map((b) => ({ value: b.id, label: nameWithAlias(b) })))], { onChange: (x) => set({ brandId: x === NONE ? "" : x }), disabled: busy, description: <FieldDescription>Pick the brand this recipe brews, or leave it undecided. Packaging always asks for the brand.</FieldDescription> }) : null}
      {E.edit("Note · optional", v.note, "text", undefined, { onChange: (nextValue: string) => set({ note: nextValue }), id: `${id}-note`, disabled: busy })}
    </>
  );
}

/** The Recipe name sheet's body: a saved recipe's name and note, and the Save that writes them (update_recipe). */
export function RecipeNameView({ values, onChange, onSave, busy = false, error }: {
  values: Pick<NewRecipeValues, "name" | "note">;
  onChange?: (values: Pick<NewRecipeValues, "name" | "note">) => void;
  onSave?: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <NewRecipeFieldsView values={{ ...BLANK_RECIPE, ...values }} onChange={onChange && (({ name, note }) => onChange({ name, note }))} busy={busy} />
      <CommandFormMessage error={error} />
      <CommandFormFooter>
        {E.submit("Save name and note", { type: "button", submitting: busy, reason: values.name.trim() ? undefined : "Enter a name.", onClick: onSave })}
      </CommandFormFooter>
    </div>
  );
}
