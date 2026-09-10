// app/(app)/batches/new-batch-form.tsx — CommandForm for schedule_batch:
// date and planned barrels commit the slot; brand and recipe version are
// both optional statements of intent (identity is required at packaging,
// not here).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { NONE } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toScheduleBatchViewProps } from "@/lib/mgr/schedule-batch-view";


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
  const model = toScheduleBatchViewProps({
    backHref: "/batches",
    title: "New batch",
    recipeId: recipeVersionId,
    recipe: recipeVersions.find(({ id }) => id === recipeVersionId)?.label ?? "Not decided",
    recipeOptions: recipeVersions,
    brandId: intendedBrandId,
    brand: brands.find(({ id }) => id === intendedBrandId)?.name ?? "Not decided",
    brandOptions: brands.map(({ id, name: label }) => ({ id, label })),
    plannedBbl,
    date: plannedOn,
    note,
  });
  const optional = (set: (value: string) => void) => (value: string) => set(value === NONE ? "" : value);
  const controls = {
    recipeId: optional(setRecipeVersionId),
    brandId: optional(setIntendedBrandId),
    plannedBbl: setPlannedBbl,
    date: setPlannedOn,
    note: setNote,
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Schedule batch" trigger={<Button size="sm">New batch</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <ScheduleBatchView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={
            <CommandFormFooter>
              <Button type="submit" disabled={form.submitting || !ready}>
                {form.submitting ? "Saving…" : "Save schedule"}
              </Button>
            </CommandFormFooter>
          }
        />
      </form>
    </CommandForm>
  );
}
