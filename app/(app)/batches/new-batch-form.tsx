// app/(app)/batches/new-batch-form.tsx — CommandForm for schedule_batch:
// date and planned barrels commit the slot; brand and recipe version are
// both optional statements of intent (identity is required at packaging,
// not here). Schedule batch names what it still needs (scheduleBatchReason).
"use client";

import { brandLabel } from "@/lib/mgr/brand-view";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { NONE } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { scheduleBatchReason } from "@/lib/mgr/schedule-batch-view";
type Brand = { id: string; name: string; alias?: string | null };
type RecipeVersion = { id: string; label: string };

export function NewBatchForm({ brands, recipeVersions, today }: { brands: Brand[]; recipeVersions: RecipeVersion[]; today?: string }) {
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
  const reason = scheduleBatchReason({ date: plannedOn, plannedBbl });
  const model = {
    recipeId: recipeVersionId,
    recipe: recipeVersions.find(({ id }) => id === recipeVersionId)?.label ?? "Not decided",
    recipeOptions: recipeVersions,
    brandId: intendedBrandId,
    brand: brands.find(({ id }) => id === intendedBrandId)?.name ?? "Not decided",
    brandOptions: brands.map((b) => ({ id: b.id, label: brandLabel(b) })),
    plannedBbl,
    date: plannedOn,
    today,
    note,
  };
  const optional = (set: (value: string) => void) => (value: string) => set(value === NONE ? "" : value);
  const controls = {
    recipeId: optional(setRecipeVersionId),
    brandId: optional(setIntendedBrandId),
    plannedBbl: setPlannedBbl,
    date: setPlannedOn,
    note: setNote,
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New batch" trigger={<Button size="sm">New batch</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <ScheduleBatchView
          model={model}
          controls={controls}
          messages={<CommandFormMessage error={form.error} />}
          footer={
            <CommandFormFooter>{E.submit("Schedule batch", { submitting: form.submitting, reason })}</CommandFormFooter>
          }
        />
      </form>
    </CommandForm>
  );
}
