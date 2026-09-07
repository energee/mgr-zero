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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

// ponytail: Radix Select refuses an empty-string item, so the "nothing chosen"
// choice is a sentinel mapped back to "" at the edge; state stays as before.
const NONE = "__none__";

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
          <Select value={recipeVersionId || NONE} onValueChange={(v) => setRecipeVersionId(v === NONE ? "" : v)}>
            <SelectTrigger id="bat-recipe"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not decided</SelectItem>
              {recipeVersions.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bat-brand">Brand · optional</Label>
          <Select value={intendedBrandId || NONE} onValueChange={(v) => setIntendedBrandId(v === NONE ? "" : v)}>
            <SelectTrigger id="bat-brand"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not decided</SelectItem>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
