// components/mgr/views/cellar-addition.tsx — Cellar addition sheet: occupancy,
// material, lot when tracked, post-knockout stage, quantity in the material's
// base unit, and the consumption preview. Inventory passes a fixture with no
// onChange; live wraps it in cellar-addition-form.tsx.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { Qty } from "@/components/mgr/qty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ADDITION_STAGES, additionPreview, type AdditionStage, type CellarAdditionViewModel } from "@/lib/mgr/cellar-addition-view";
import { occupancyIdentity } from "@/lib/mgr/cellar-transfer-view";

export function CellarAdditionFooter(props: { formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <IrreversibleSubmit label="Record addition" {...props} />;
}


export function CellarAdditionView({ model, onChange, messages, footer, submitting = false }: {
  model: CellarAdditionViewModel; onChange?: (patch: Partial<Pick<CellarAdditionViewModel, "occupancyId" | "materialId" | "lotId" | "stage" | "qty">>) => void;
  messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  const material = model.materials.find((m) => m.id === model.materialId);
  const lots = model.lotsByMaterial[model.materialId] ?? [];
  const preview = additionPreview(model);
  // Inventory (no onChange) draws the fixture uncontrolled; live is controlled.
  const sel = (name: "occupancyId" | "materialId" | "lotId" | "stage") => onChange ? { value: model[name] } : { defaultValue: model[name] };
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.pick("Occupancy", model.occupancyId, [{ value: "", label: "Tank with beer in it" }, ...(model.occupancies.map((o) => ({ value: o.occupancy_id, label: (o.vessel_name ?? "Unnamed vessel") + " · " + (occupancyIdentity(o)) })))], { onChange: onChange ? (nextValue: string) => onChange?.({ occupancyId: nextValue }) : undefined, required: true })}
      {E.pick("Material", model.materialId, [{ value: "", label: "Hop, fruit or adjunct" }, ...(model.materials.map((m) => ({ value: m.id, label: m.name + " · " + m.category })))], { onChange: onChange ? (nextValue: string) => onChange?.({ materialId: nextValue, lotId: "" }) : undefined, required: true })}
      {material?.lot_tracked && E.pick("Lot", model.lotId, [{ value: "", label: "Choose a lot" }, ...lots.map(l => ({ value: l.lot_id, label: `${l.lot_code} · ${l.qty} ${material.base_uom}` }))], { onChange: onChange ? value => onChange({ lotId: value }) : undefined, required: true })}
      <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" {...sel("stage")} onValueChange={(v) => { if (v) onChange?.({ stage: v as AdditionStage }); }}>
        {Object.entries(ADDITION_STAGES).map(([id, label]) => <ToggleGroupItem key={id} value={id}>{label}</ToggleGroupItem>)}
      </ToggleGroup>
      <Qty label="Quantity" value={model.qty} unit={material?.base_uom ?? ""} onChange={onChange ? (qty) => onChange({ qty }) : undefined} />
      {preview.valid ? E.info(preview.text) : E.note(preview.reason)}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.pin(<CellarAdditionFooter submitting={submitting} />)}
  </>;
}
