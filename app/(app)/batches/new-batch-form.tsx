// app/(app)/batches/new-batch-form.tsx — CommandForm for schedule_batch:
// date and planned barrels commit the slot; brand and recipe version are
// both optional statements of intent (identity is required at packaging,
// not here). Schedule batch names what it still needs (scheduleBatchReason).
// The date starts on the brewery's today, and picking a recipe fills in its
// brand while none is chosen (#1508).
"use client";

import { brandLabel } from "@/lib/mgr/brand-view";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { brandAfterRecipePick, scheduleBatchReason } from "@/lib/mgr/schedule-batch-view";
type Brand = { id: string; name: string; alias?: string | null };
type RecipeVersion = { id: string; label: string; brandId?: string | null };

export function NewBatchForm({ brands, recipeVersions, today, brandsHref }: { brands: Brand[]; recipeVersions: RecipeVersion[]; today?: string; brandsHref: string | null }) {
  const [intendedBrandId, setIntendedBrandId] = useState("");
  const [recipeVersionId, setRecipeVersionId] = useState("");
  const [plannedOn, setPlannedOn] = useState(today ?? "");
  const [plannedBbl, setPlannedBbl] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("schedule_batch", {
    build: () => ({
      intendedBrandId: intendedBrandId || undefined, recipeVersionId: recipeVersionId || undefined,
      plannedOn, plannedBbl: Number(plannedBbl), note: note || undefined,
    }),
    reset: () => { setIntendedBrandId(""); setRecipeVersionId(""); setPlannedOn(today ?? ""); setPlannedBbl(""); setNote(""); },
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
    recipesHref: "/recipes",
    brandsHref,
  };
  const controls = {
    recipeId: (id: string) => {
      setRecipeVersionId(id);
      setIntendedBrandId(brandAfterRecipePick(intendedBrandId, recipeVersions.find(version => version.id === id)?.brandId));
    },
    brandId: setIntendedBrandId,
    plannedBbl: setPlannedBbl,
    date: setPlannedOn,
    note: setNote,
  };
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New batch" trigger={<Button size="sm">New batch</Button>}>
      <form onSubmit={event => { if (reason) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-4">
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
