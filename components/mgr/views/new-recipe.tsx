// components/mgr/views/new-recipe.tsx — the recipe parent fields: what a
// recipe is before it has a version. Name, style (gated until recipes
// carries a style column), and the brand it is meant to brew and a note,
// both optional. Fields only, no form of their own: the inventory Recipe
// record mounts them in RecipeView's parentForm slot and the live version
// form (app/(app)/recipes/[id]/recipe-version-form.tsx) draws them above the
// first version so one save creates both.
"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type NewRecipeValues = { name: string; brandId: string; note: string };
export type NewRecipeBrand = { id: string; name: string };
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input id={`${id}-name`} value={v.name} onChange={(e) => set({ name: e.target.value })} required disabled={busy} />
      </div>
      {E.gated("Style", "arrives with the recipe style column; the brand carries style today")}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-brand`}>Brand · optional</Label>
        <Select value={v.brandId || NONE} onValueChange={(x) => set({ brandId: x === NONE ? "" : x })} disabled={busy}>
          <SelectTrigger id={`${id}-brand`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not decided</SelectItem>
            {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-note`}>Note · optional</Label>
        <Input id={`${id}-note`} value={v.note} onChange={(e) => set({ note: e.target.value })} disabled={busy} />
      </div>
      {E.info("The brand is intent only; identity is required at packaging.")}
    </>
  );
}
