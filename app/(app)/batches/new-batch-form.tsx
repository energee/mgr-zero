// app/(app)/batches/new-batch-form.tsx — CommandForm for schedule_batch:
// date and planned barrels commit the slot; brand and recipe version are
// both optional statements of intent (identity is required at packaging,
// not here). Schedule batch names what it still needs (scheduleBatchReason).
// The date starts on the brewery's today, and picking a recipe fills in its
// brand while none is chosen (#1508). `recipeVersionId` (the Recipe page's
// Schedule batch link, #1581) opens the sheet on mount with that version and
// its brand chosen; closing or saving drops the link from the URL, so New batch
// opens blank again and a reload does not reopen it.
"use client";

import { brandLabel } from "@/lib/mgr/brand-view";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ScheduleBatchView } from "@/components/mgr/views/schedule-batch";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { brandAfterRecipePick, scheduleBatchReason } from "@/lib/mgr/schedule-batch-view";
type Brand = { id: string; name: string; alias?: string | null };
type RecipeVersion = { id: string; label: string; brandId?: string | null };

export function NewBatchForm({ brands, recipeVersions, today, brandsHref, recipeVersionId: linkedVersionId = "" }: { brands: Brand[]; recipeVersions: RecipeVersion[]; today?: string; brandsHref: string | null; recipeVersionId?: string }) {
  const router = useRouter();
  const linkedBrandId = brandAfterRecipePick("", recipeVersions.find(version => version.id === linkedVersionId)?.brandId);
  const [intendedBrandId, setIntendedBrandId] = useState(linkedBrandId);
  const [recipeVersionId, setRecipeVersionId] = useState(linkedVersionId);
  const [plannedOn, setPlannedOn] = useState(today ?? "");
  const [plannedBbl, setPlannedBbl] = useState("");
  const [note, setNote] = useState("");
  const dropLink = () => { if (linkedVersionId) router.replace("/batches", { scroll: false }); };
  const form = useCommandForm("schedule_batch", {
    defaultOpen: Boolean(linkedVersionId),
    build: () => ({
      intendedBrandId: intendedBrandId || undefined, recipeVersionId: recipeVersionId || undefined,
      plannedOn, plannedBbl: Number(plannedBbl), note: note || undefined,
    }),
    reset: () => { setIntendedBrandId(linkedBrandId); setRecipeVersionId(linkedVersionId); setPlannedOn(today ?? ""); setPlannedBbl(""); setNote(""); },
    onSuccess: dropLink,
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
    <CommandForm open={form.open} onOpenChange={open => { form.setOpen(open); if (!open) dropLink(); }} title="New batch" trigger={<Button size="sm">New batch</Button>}>
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
