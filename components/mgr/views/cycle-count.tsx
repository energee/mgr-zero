"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Qty, TabBar } from "@/components/mgr/qty";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";

export type { CycleCountViewModel };

export function CycleCountFooter(props: { formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <IrreversibleSubmit label="Record count" busy="Recording…" {...props} />;
}

export function CycleCountView({ model, footer, onQuantity, onLocation, onBin, messages, submitting = false, disabled = false }: {
  model: CycleCountViewModel; footer?: ReactNode; messages?: ReactNode;
  onQuantity?: (value: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void;
  submitting?: boolean; disabled?: boolean;
}) {
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.nav("Material", model.material)}
      {model.locations && <div className="grid grid-cols-2 gap-2">
        {E.pick("Location", String(model.locationId ?? ""), [{ value: "", label: "Select location" }, ...(model.locations.map(location => ({ value: location.id, label: location.name })))], { onChange: onLocation, required: true })}
        {E.pick("Bin", String(model.binId ?? ""), [{ value: "", label: "Select bin" }, ...(model.bins?.map(bin => ({ value: bin.id, label: bin.name })) ?? [])], { onChange: onBin, required: true })}
      </div>}
      <Qty label={`Counted (${model.units[model.unitIndex] ?? ""})`} value={model.qty} onChange={onQuantity} unit={model.units.length === 1 ? model.units[0] : <TabBar names={model.units} on={model.unitIndex} cls="w-fit" />} />
      {E.info(model.preview)}
      {model.lotPreviewUnavailable && E.gated("Lot allocation preview", "The count read query returns bin totals only. The command allocates the variance when recorded.")}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.pin(<CycleCountFooter submitting={submitting} disabled={disabled} />)}
  </>;
}
