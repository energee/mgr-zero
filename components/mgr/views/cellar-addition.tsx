// components/mgr/views/cellar-addition.tsx — Cellar addition sheet: occupancy,
// material, lot when tracked, post-knockout stage, quantity in the material's
// base unit, and the consumption preview. Inventory passes a fixture with no
// onChange; live wraps it in cellar-addition-form.tsx.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { Qty } from "@/components/mgr/qty";
import { Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ADDITION_STAGES, additionPreview, type AdditionStage, type CellarAdditionViewModel } from "@/lib/mgr/cellar-addition-view";
import { occupancyIdentity } from "@/lib/mgr/cellar-transfer-view";

export function CellarAdditionFooter(props: { formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <IrreversibleSubmit label="Record addition" {...props} />;
}

const SELECT = "min-w-0 rounded border bg-background p-2";

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
      <Field><FieldLabel>Occupancy</FieldLabel><select aria-label="Occupancy" required className={SELECT} {...sel("occupancyId")} onChange={(e) => onChange?.({ occupancyId: e.target.value })}>
        <option value="">Tank with beer in it</option>{model.occupancies.map((o) => <option key={o.occupancy_id} value={o.occupancy_id}>{o.vessel_name ?? "Unnamed vessel"} · {occupancyIdentity(o)}</option>)}
      </select></Field>
      <Field><FieldLabel>Material</FieldLabel><select aria-label="Material" required className={SELECT} {...sel("materialId")} onChange={(e) => onChange?.({ materialId: e.target.value, lotId: "" })}>
        <option value="">Hop, fruit or adjunct</option>{model.materials.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.category}</option>)}
      </select></Field>
      {material?.lot_tracked && <Field><FieldLabel>Lot</FieldLabel><select aria-label="Lot" required className={SELECT} {...sel("lotId")} onChange={(e) => onChange?.({ lotId: e.target.value })}>
        <option value="">Choose a lot</option>{lots.map((l) => <option key={l.lot_id} value={l.lot_id}>{l.lot_code} · {l.qty} {material.base_uom}</option>)}
      </select></Field>}
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
