// components/mgr/views/schedule-batch.tsx — shared New batch sheet body; its
// one verb is Schedule batch. It draws no title: the sheet it opens in
// (CommandForm live, ScreenSheet in the inventory) already names it (#1120).
"use client";
import { useId, useState, type ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E, type PickEmpty } from "@/components/mgr/e";
import { pastPlanWarning, plannedBarrelsError, type ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { FieldDescription } from "@/components/ui/field";

type Controls = Partial<Record<"recipeId" | "brandId" | "plannedBbl" | "date" | "note", (value: string) => void>>;

function OptionalPick({ label, value, options, onChange, empty }: {
  label: string; value?: string; options: { id: string; label: string }[]; onChange?: (value: string) => void; empty: PickEmpty;
}) {
  return (
    E.pick(label, value || "", [{ value: "", label: "Not decided" }, ...(options.map(option => ({ value: option.id, label: option.label })))], { onChange, empty })
  );
}

export function ScheduleBatchView({ model, controls = {}, messages, footer }: {
  model: ScheduleBatchViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  const id = useId();
  const touched = useTouchedLines(!controls.plannedBbl);
  const [internalDate, setInternalDate] = useState(model.date);
  const date = controls.date ? model.date : internalDate;
  const warning = pastPlanWarning(date, model.today);
  return (
    <>
      <OptionalPick label="Recipe · optional" value={model.recipeId} options={model.recipeOptions} onChange={controls.recipeId} empty={{ text: "No recipe versions available. Add a recipe and save a version, or leave this undecided.", label: "Recipes", href: model.recipesHref, to: "Recipes" }} />
      <OptionalPick label="Brand · optional" value={model.brandId} options={model.brandOptions} onChange={controls.brandId} empty={model.brandsHref === null
        ? { text: "No brands yet. An admin or sales member adds them in Catalog. You can leave this undecided." }
        : { text: "No brands yet. You can leave this undecided.", label: "Add a brand", href: model.brandsHref, to: "Catalog" }} />
      <div className="flex flex-col gap-2">
        {E.edit("Planned barrels", model.plannedBbl, "number", undefined, {
          onChange: controls.plannedBbl, onBlur: () => touched.touch(0),
          id: `${id}-barrels`, "aria-describedby": `${id}-precision`,
          error: touched.shown(0) ? plannedBarrelsError(model.plannedBbl) : undefined,
          required: Boolean(controls.plannedBbl), min: 0, max: 9_999_999.999, step: "any", inputMode: "decimal",
        })}
        <FieldDescription id={`${id}-precision`}>Fractional barrels are allowed; stored to three decimal places.</FieldDescription>
      </div>
      <DatePicker label="Date" value={date} onChange={controls.date ?? setInternalDate} />
      {warning && E.note(warning)}
      {E.edit("Note · optional", model.note, "text", undefined, { onChange: controls.note })}
      {E.sp()}
      {messages}
      {footer !== undefined ? footer : E.btn("Schedule batch")}
    </>
  );
}
