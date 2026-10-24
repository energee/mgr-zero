// components/mgr/views/schedule-batch.tsx — shared New batch sheet body; its
// one verb is Schedule batch. It draws no title: the sheet it opens in
// (CommandForm live, ScreenSheet in the inventory) already names it (#1120).
import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E, type PickEmpty } from "@/components/mgr/e";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";

export type { ScheduleBatchViewModel };

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
  return (
    <>
      <OptionalPick label="Recipe · optional" value={model.recipeId} options={model.recipeOptions} onChange={controls.recipeId} empty={{ text: "No recipe versions available. Add a recipe and save a version, or leave this undecided.", label: "Recipes", href: model.recipesHref, to: "Recipes" }} />
      <OptionalPick label="Brand · optional" value={model.brandId} options={model.brandOptions} onChange={controls.brandId} empty={model.brandsHref === null
        ? { text: "No brands yet. An admin or sales member adds them in Catalog. You can leave this undecided." }
        : { text: "No brands yet. You can leave this undecided.", label: "Add a brand", href: model.brandsHref, to: "Catalog" }} />
      {E.edit("Planned barrels", model.plannedBbl, "number", undefined, { onChange: controls.plannedBbl, required: Boolean(controls.plannedBbl), min: 0, step: "any", inputMode: "decimal" })}
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
