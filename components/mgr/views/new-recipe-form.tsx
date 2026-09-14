// components/mgr/views/new-recipe-form.tsx — Create recipe, the one surface
// both the inventory Recipes record and the live page open. NewRecipeFieldsView
// is the form body (name, optional brand, optional note, style gated until
// recipes carries a style_id); NewRecipeFormView wraps it in the CommandForm
// sheet with its trigger. Callers own values and the submit; the inventory
// leaves them uncontrolled, the live adapter binds create_recipe.
"use client";

import { useId, useState, type FormEventHandler, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type NewRecipeValues = { name: string; brandId: string; note: string };
export type NewRecipeBrand = { id: string; name: string };
const BLANK: NewRecipeValues = { name: "", brandId: "", note: "" };

export function NewRecipeFieldsView({ brands, values, onChange, onSubmit, busy = false, error }: {
  brands: NewRecipeBrand[];
  values?: NewRecipeValues;
  onChange?: (values: NewRecipeValues) => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  busy?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [draft, setDraft] = useState(BLANK);
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
      <CommandFormMessage error={error} />
      <CommandFormFooter>
        <Button type="submit" disabled={busy || !v.name.trim()}>{busy ? "Saving…" : "Create recipe"}</Button>
      </CommandFormFooter>
    </form>
  );
}

export function NewRecipeFormView({ open, onOpenChange, ...fields }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & Parameters<typeof NewRecipeFieldsView>[0]): ReactNode {
  const [localOpen, setLocalOpen] = useState(false);
  return (
    <CommandForm open={open ?? localOpen} onOpenChange={onOpenChange ?? setLocalOpen} title="Create recipe" trigger={<Button size="sm">Create recipe</Button>}>
      <NewRecipeFieldsView {...fields} />
    </CommandForm>
  );
}
