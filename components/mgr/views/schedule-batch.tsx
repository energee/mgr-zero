// components/mgr/views/schedule-batch.tsx — shared New batch sheet body; its
// one verb is Schedule batch. It draws no title: the sheet it opens in
// (CommandForm live, ScreenSheet in the inventory) already names it (#1120).
"use client";
import { useId, type ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import { NONE } from "@/components/ui/select";
import { plannedBarrelsError, type ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { FieldDescription } from "@/components/ui/field";

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
  const id = useId();
  const touched = useTouchedLines(!controls.plannedBbl);
  return (
    <>
      <OptionalPick label="Recipe · optional" value={model.recipeId} options={model.recipeOptions} onChange={controls.recipeId} />
      <OptionalPick label="Brand · optional" value={model.brandId} options={model.brandOptions} onChange={controls.brandId} />
      <div className="flex flex-col gap-2">
        {E.edit("Planned barrels", model.plannedBbl, "number", undefined, {
          onChange: controls.plannedBbl, onBlur: () => touched.touch(0),
          id: `${id}-barrels`, "aria-describedby": `${id}-precision`,
          error: touched.shown(0) ? plannedBarrelsError(model.plannedBbl) : undefined,
          required: Boolean(controls.plannedBbl), min: 0, max: 9_999_999.999, step: "any", inputMode: "decimal",
        })}
        <FieldDescription id={`${id}-precision`}>Fractional barrels are allowed; stored to three decimal places.</FieldDescription>
      </div>
      {controls.date
        ? <DatePicker label="Date" value={model.date} onChange={controls.date} />
        : <DatePicker label="Date" defaultValue={model.date} />}
      {E.edit("Note · optional", model.note, "text", undefined, { onChange: controls.note })}
      {E.sp()}
      {messages}
      {footer !== undefined ? footer : E.btn("Schedule batch")}
    </>
  );
}
