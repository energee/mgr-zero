// components/mgr/views/schedule-batch.tsx — shared New batch sheet body; its
// one verb is Schedule batch. It draws no title: the sheet it opens in
// (CommandForm live, ScreenSheet in the inventory) already names it (#1120).
"use client";
import { useState, type ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import { NONE } from "@/components/ui/select";
import { pastPlanWarning, type ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";

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
  const [internalDate, setInternalDate] = useState(model.date);
  const date = controls.date ? model.date : internalDate;
  const warning = pastPlanWarning(date, model.today);
  return (
    <>
      <OptionalPick label="Recipe · optional" value={model.recipeId} options={model.recipeOptions} onChange={controls.recipeId} />
      <OptionalPick label="Brand · optional" value={model.brandId} options={model.brandOptions} onChange={controls.brandId} />
      {E.edit("Planned barrels", model.plannedBbl, "number", undefined, { onChange: controls.plannedBbl, required: Boolean(controls.plannedBbl), min: 0, step: "any", inputMode: "decimal" })}
      <DatePicker label="Date" value={date} onChange={controls.date ?? setInternalDate} />
      {warning && E.note(warning)}
      {E.edit("Note · optional", model.note, "text", undefined, { onChange: controls.note })}
      {E.sp()}
      {messages}
      {footer !== undefined ? footer : E.btn("Schedule batch")}
    </>
  );
}
