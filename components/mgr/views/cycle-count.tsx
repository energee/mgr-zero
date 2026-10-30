// components/mgr/views/cycle-count.tsx — the material count form body, shared
// by a row's Cycle count (one line) and the Count sheet (one line per material
// held in the bin, #1583): location and bin, each line's counted field and
// preview, one Preview count, then one Record count in the footer.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Qty, TabBar } from "@/components/mgr/qty";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";

export function CycleCountFooter({ retry = false, ...props }: { formId?: string; submitting?: boolean; disabled?: boolean; retry?: boolean }) {
  return <IrreversibleSubmit label={retry ? "Retry unchanged count" : "Record count"} busy="Recording…" {...props} />;
}

/** `previewReason` says why Preview count is withheld (the live form's missing location, bin or count). `onQuantity` names the line by its key. */
export function CycleCountView({ model, footer, onQuantity, onLocation, onBin, messages, submitting = false, previewReason, onPreview, previewing = false, frozen = false }: {
  model: CycleCountViewModel; footer?: ReactNode; messages?: ReactNode;
  onQuantity?: (key: string, value: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void;
  submitting?: boolean; previewReason?: string | null;
  onPreview?: () => void; previewing?: boolean; frozen?: boolean;
}) {
  return <>
    {/* Not held while previewing: the live form previews as the count is typed. */}
    <fieldset disabled={submitting || frozen} className="flex flex-col gap-3">
      {model.locations && <div className="grid grid-cols-2 gap-2">
        {E.pick("Location", String(model.locationId ?? ""), [{ value: "", label: "Select location", disabled: true }, ...(model.locations.map(location => ({ value: location.id, label: location.name })))], { onChange: onLocation, required: true })}
        {E.pick("Bin", String(model.binId ?? ""), [{ value: "", label: "Select bin", disabled: true }, ...(model.bins?.map(bin => ({ value: bin.id, label: bin.name })) ?? [])], { onChange: onBin, required: true })}
      </div>}
      {model.empty && E.info(model.empty)}
      {/* Each line is a named group, so every "Counted" field says which material it counts. */}
      {model.lines.map(line => <div key={line.key} role="group" aria-label={line.material} className="flex flex-col gap-3">
        {E.nav("Material", line.material)}
        <Qty label={`Counted (${line.units[line.unitIndex] ?? ""})`} value={line.qty} onChange={onQuantity && (value => onQuantity(line.key, value))} unit={line.units.length === 1 ? line.units[0] : <TabBar names={line.units} on={line.unitIndex} cls="w-fit" />} />
        {E.info(line.preview)}
        {line.adjustments?.map(adjustment => <div key={adjustment.key}>{E.fld(adjustment.lot, `before ${adjustment.expected.toLocaleString("en-US", { maximumFractionDigits: 4 })} · after ${adjustment.counted.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${adjustment.unit} · adjustment ${adjustment.delta > 0 ? "+" : ""}${adjustment.delta.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${adjustment.unit}`)}</div>)}
        {line.adjustments?.length === 0 && E.info("No adjustment movements. This count will still be recorded.")}
      </div>)}
      {E.submit("Preview count", { type: "button", variant: "outline", className: "w-full md:w-fit md:self-end", onClick: onPreview, reason: previewReason, submitting: previewing, busy: "Previewing…", disabled: submitting || frozen })}
    </fieldset>
    {frozen && E.note("No trustworthy response arrived. The quantity, allocation and request are frozen. Retry this unchanged count to recover its original result.", "alert")}
    {messages}
    {footer !== undefined ? footer : E.pin(<CycleCountFooter submitting={submitting} disabled={Boolean(previewReason)} />)}
  </>;
}
