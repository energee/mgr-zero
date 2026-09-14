// components/mgr/views/repack.tsx — the Repack sheet. The inventory draws the
// fixture read-only; the live sheet (packaging/repack-form.tsx) passes
// `controls` and the same fields become the location, bin and parent pickers
// and a typed quantity. The "into" leg is never typed: it is derived.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { Qty } from "@/components/mgr/qty";
import { Field, FieldLabel } from "@/components/ui/field";
import type { RepackViewModel } from "@/lib/mgr/repack-view";

type Option = { id: string; name: string };
export type RepackControls = {
  locations: Option[]; bins: Option[]; parents: Option[];
  locationId: string; binId: string; parentSkuId: string;
  onLocation: (id: string) => void; onBin: (id: string) => void; onParent: (id: string) => void; onQuantity: (value: string) => void;
};

export function RepackFooter(props: { formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <IrreversibleSubmit label="Confirm repack" busy="Recording…" {...props} />;
}

const pick = (label: string, value: string, options: Option[], onChange: (id: string) => void, disabled = false) => (
  <Field><FieldLabel>{label}</FieldLabel><select aria-label={label} required disabled={disabled} className="min-w-0 rounded border bg-background p-2" value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Select {label.toLowerCase()}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
  </select></Field>
);

export function RepackView({ model, footer, controls, messages, submitting = false }: { model: RepackViewModel; footer?: ReactNode; controls?: RepackControls; messages?: ReactNode; submitting?: boolean }) {
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {controls ? pick("Break", controls.parentSkuId, controls.parents, controls.onParent) : E.fld("Break", model.parent)}
      {controls
        ? <div className="grid grid-cols-2 gap-2">{pick("Location", controls.locationId, controls.locations, controls.onLocation)}{pick("Bin", controls.binId, controls.bins, controls.onBin, !controls.locationId)}</div>
        : E.fld("Location · bin", model.location)}
      {controls ? <Qty label="Quantity" value={model.qty} unit={model.unit} onChange={controls.onQuantity} /> : E.qty(model.qty, model.unit)}
      {E.tape(model.tape)}
      {E.info(model.preview)}
      {E.fld("Damaged on break", model.damaged)}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.pin(model.unavailable ? E.gated("Record repack", model.unavailable) : E.btn("Record repack"))}
  </>;
}
