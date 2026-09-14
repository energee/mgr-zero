// components/mgr/views/schedule-batch.tsx — shared Schedule batch sheet body.
import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import { NONE } from "@/components/ui/select";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";

export type { ScheduleBatchViewModel };

type Controls = Partial<Record<"recipeId" | "brandId" | "plannedBbl" | "date" | "note", (value: string) => void>>;

function OptionalPick({ label, value, options, onChange }: {
  label: string; value?: string; options: { id: string; label: string }[]; onChange?: (value: string) => void;
}) {
  const selected = value || NONE;
  return (
    E.pick(label, selected, [{ value: NONE, label: "Not decided" }, ...(options.map(option => ({ value: option.id, label: option.label })))], { onChange })
  );
}

export function ScheduleBatchView({ model, controls = {}, messages, footer }: {
  model: ScheduleBatchViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      {E.back("Batches", model.title, undefined, model.backHref)}
      <OptionalPick label="Recipe · optional" value={model.recipeId} options={model.recipeOptions} onChange={controls.recipeId} />
      <OptionalPick label="Brand · optional" value={model.brandId} options={model.brandOptions} onChange={controls.brandId} />
      {E.edit("Planned barrels", model.plannedBbl, "number", undefined, { onChange: controls.plannedBbl, required: Boolean(controls.plannedBbl), min: 0, step: "any", inputMode: "decimal" })}
      {controls.date
        ? <DatePicker label="Date" value={model.date} onChange={controls.date} />
        : <DatePicker label="Date" defaultValue={model.date} />}
      {E.edit("Note · optional", model.note, "text", undefined, { onChange: controls.note })}
      {E.sp()}
      {messages}
      {footer !== undefined ? footer : E.btn("Save schedule")}
    </>
  );
}
