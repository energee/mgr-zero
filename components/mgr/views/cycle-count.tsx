"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Qty, TabBar } from "@/components/mgr/qty";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";

export type { CycleCountViewModel };

export function CycleCountFooter({ retry = false, ...props }: { formId?: string; submitting?: boolean; disabled?: boolean; retry?: boolean }) {
  return <IrreversibleSubmit label={retry ? "Retry unchanged count" : "Record count"} busy="Recording…" {...props} />;
}

export function CycleCountView({ model, footer, onQuantity, onLocation, onBin, messages, submitting = false, disabled = false, onPreview, previewing = false, frozen = false }: {
  model: CycleCountViewModel; footer?: ReactNode; messages?: ReactNode;
  onQuantity?: (value: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void;
  submitting?: boolean; disabled?: boolean;
  onPreview?: () => void; previewing?: boolean; frozen?: boolean;
}) {
  return <>
    <fieldset disabled={submitting || previewing || frozen} className="flex flex-col gap-3">
      {E.nav("Material", model.material)}
      {model.locations && <div className="grid grid-cols-2 gap-2">
        {E.pick("Location", String(model.locationId ?? ""), [{ value: "", label: "Select location" }, ...(model.locations.map(location => ({ value: location.id, label: location.name })))], { onChange: onLocation, required: true })}
        {E.pick("Bin", String(model.binId ?? ""), [{ value: "", label: "Select bin" }, ...(model.bins?.map(bin => ({ value: bin.id, label: bin.name })) ?? [])], { onChange: onBin, required: true })}
      </div>}
      <Qty label={`Counted (${model.units[model.unitIndex] ?? ""})`} value={model.qty} onChange={onQuantity} unit={model.units.length === 1 ? model.units[0] : <TabBar names={model.units} on={model.unitIndex} cls="w-fit" />} />
      {E.info(model.preview)}
      {E.btn(previewing ? "Previewing…" : "Preview count", disabled || submitting || previewing || frozen ? "g disabled" : "g", undefined, onPreview)}
      {model.adjustments?.map(adjustment => <div key={adjustment.key}>{E.fld(adjustment.lot, `before ${adjustment.expected.toLocaleString("en-US", { maximumFractionDigits: 4 })} · after ${adjustment.counted.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${adjustment.unit} · adjustment ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${adjustment.unit}`)}</div>)}
      {model.adjustments?.length === 0 && E.info("No adjustment movements. This count will still be recorded.")}
    </fieldset>
    {frozen && E.note("No trustworthy response arrived. The quantity, allocation and request are frozen. Retry this unchanged count to recover its original result.")}
    {messages}
    {footer !== undefined ? footer : E.pin(<CycleCountFooter submitting={submitting} disabled={disabled} />)}
  </>;
}
