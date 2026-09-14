// components/mgr/views/new-recipe.tsx — the New recipe parent form: what a
// recipe is before it has a version. Name, style (gated until recipes carries
// a style column), and the brand it is meant to brew and a note, both
// optional. Sits in RecipeView's detail slot on the inventory New recipe
// record and on app/(app)/recipes/new; the live adapter binds create_recipe
// and lands on the recipe's page for its first version.
"use client";

import { useId, useState, type FormEventHandler } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type NewRecipeValues = { name: string; brandId: string; note: string };
export type NewRecipeBrand = { id: string; name: string };
export const BLANK_RECIPE: NewRecipeValues = { name: "", brandId: "", note: "" };

export function NewRecipeFormView({ brands, values, onChange, onSubmit, busy = false, error }: {
  brands: NewRecipeBrand[];
  values?: NewRecipeValues;
  onChange?: (values: NewRecipeValues) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  busy?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState(BLANK_RECIPE);
  const v = values ?? draft;
  const set = (patch: Partial<NewRecipeValues>) => { const next = { ...v, ...patch }; setDraft(next); onChange?.(next); };
  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (!busy && v.name.trim()) onSubmit?.(event); }}>
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
      {E.info("The brand is intent only; identity is required at packaging. Versions are written on the recipe once it exists.")}
      <CommandFormMessage error={error} />
      <Button type="submit" className="w-full md:w-fit md:self-end" disabled={busy || !v.name.trim()}>{busy ? "Saving…" : "Create recipe"}</Button>
    </form>
  );
}
