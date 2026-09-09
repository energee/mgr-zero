// components/mgr/views/schedule-batch.tsx — Schedule batch inventory drawing.
// Live create stays NewBatchForm (E.pick is not a controlled CommandForm).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";

export type { ScheduleBatchViewModel };

export function ScheduleBatchView({
  model,
  form,
}: {
  model: ScheduleBatchViewModel;
  form?: ReactNode;
}) {
  return (
    <>
      {E.back("Batches", model.title, undefined, model.backHref)}
      {form ?? (
        <>
          {E.pick("Recipe · optional", model.recipe, model.recipeOptions)}
          {E.pick("Brand · optional", model.brand, model.brandOptions)}
          {E.edit("Planned barrels", model.plannedBbl, "number")}
          {E.edit("Date", model.date, "date")}
          {E.sp()}
          {E.btn("Save schedule")}
        </>
      )}
    </>
  );
}
