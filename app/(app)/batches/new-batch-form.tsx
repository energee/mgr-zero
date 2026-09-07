// app/(app)/batches/new-batch-form.tsx — CommandForm for schedule_batch:
// date and planned barrels commit the slot; brand and recipe version are
// both optional statements of intent (identity is required at packaging,
// not here).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Brand = { id: string; name: string };
type RecipeVersion = { id: string; label: string };

export function NewBatchForm({ brands, recipeVersions }: { brands: Brand[]; recipeVersions: RecipeVersion[] }) {
  const [intendedBrandId, setIntendedBrandId] = useState("");
  const [recipeVersionId, setRecipeVersionId] = useState("");
  const [plannedOn, setPlannedOn] = useState("");
  const [plannedBbl, setPlannedBbl] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("schedule_batch", {
    build: () => ({
      intendedBrandId: intendedBrandId || undefined, recipeVersionId: recipeVersionId || undefined,
      plannedOn, plannedBbl: Number(plannedBbl), note: note || undefined,
    }),
    reset: () => { setIntendedBrandId(""); setRecipeVersionId(""); setPlannedOn(""); setPlannedBbl(""); setNote(""); },
  });
  const ready = plannedOn && Number(plannedBbl) > 0;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New batch" trigger={<Button size="sm">New batch</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="bat-recipe">Recipe version · optional</Label>
          <NativeSelect id="bat-recipe" value={recipeVersionId} onChange={(e) => setRecipeVersionId(e.target.value)}>
            <option value="">Not decided</option>{recipeVersions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bat-brand">Brand · optional</Label>
          <NativeSelect id="bat-brand" value={intendedBrandId} onChange={(e) => setIntendedBrandId(e.target.value)}>
            <option value="">Not decided</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bat-bbl">Planned barrels</Label>
          <Input id="bat-bbl" type="number" min="0" step="any" value={plannedBbl} onChange={(e) => setPlannedBbl(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bat-date">Date</Label>
          <Input id="bat-date" type="date" value={plannedOn} onChange={(e) => setPlannedOn(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bat-note">Note · optional</Label>
          <Input id="bat-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save schedule"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
