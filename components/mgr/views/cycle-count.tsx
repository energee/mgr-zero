"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Qty, TabBar } from "@/components/mgr/qty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";

export type { CycleCountViewModel };

export function CycleCountFooter({ formId, submitting = false, disabled = false }: { formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <Button form={formId} type="submit" data-variant="irreversible" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={submitting || disabled}>{submitting ? "Recording…" : "Record count"}</Button>;
}

export function CycleCountView({ model, footer, onQuantity, onLocation, onBin, messages, submitting = false, disabled = false }: {
  model: CycleCountViewModel; footer?: ReactNode; messages?: ReactNode;
  onQuantity?: (value: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void;
  submitting?: boolean; disabled?: boolean;
}) {
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.fld("Material", model.material)}
      {model.locations && <div className="grid grid-cols-2 gap-2">
        <Field><FieldLabel>Location</FieldLabel><select aria-label="Location" required className="min-w-0 rounded border bg-background p-2" value={onLocation ? model.locationId : undefined} defaultValue={onLocation ? undefined : model.locationId} onChange={event => onLocation?.(event.target.value)}>
          <option value="">Select location</option>{model.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select></Field>
        <Field><FieldLabel>Bin</FieldLabel><select aria-label="Bin" required className="min-w-0 rounded border bg-background p-2" value={onBin ? model.binId : undefined} defaultValue={onBin ? undefined : model.binId} onChange={event => onBin?.(event.target.value)}>
          <option value="">Select bin</option>{model.bins?.map(bin => <option key={bin.id} value={bin.id}>{bin.name}</option>)}
        </select></Field>
      </div>}
      <Qty label={`Counted (${model.units[model.unitIndex] ?? ""})`} value={model.qty} onChange={onQuantity} unit={model.units.length === 1 ? model.units[0] : <TabBar names={model.units} on={model.unitIndex} cls="w-fit" />} />
      {E.info(model.preview)}
      {model.lotPreviewUnavailable && E.gated("Lot allocation preview", "The count read query returns bin totals only. The command allocates the variance when recorded.")}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.pin(<CycleCountFooter submitting={submitting} disabled={disabled} />)}
  </>;
}
