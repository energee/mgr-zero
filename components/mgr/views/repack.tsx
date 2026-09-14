// components/mgr/views/repack.tsx — the Repack sheet. The inventory draws the
// fixture read-only; the live sheet (packaging/repack-form.tsx) puts option
// lists and ids on the model and passes callbacks, and the same fields become
// the parent, location and bin pickers and a typed quantity. The "into" leg is
// never typed: it is derived (lib/mgr/repack-view.ts).
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { Qty } from "@/components/mgr/qty";
import { Field, FieldLabel } from "@/components/ui/field";
import type { RepackOption, RepackViewModel } from "@/lib/mgr/repack-view";

type FooterProps = { formId?: string; submitting?: boolean; disabled?: boolean };

/** The pinned commit: withheld with the reason when the picked parent has no single composition row. */
export function repackFooter(model: RepackViewModel, props: FooterProps = {}) {
  return E.pin(model.unavailable ? E.gated("Confirm repack", model.unavailable) : <IrreversibleSubmit label="Confirm repack" busy="Recording…" {...props} />);
}

const pick = (label: string, value: string | undefined, options: RepackOption[], onChange?: (id: string) => void, disabled = false) => (
  <Field><FieldLabel>{label}</FieldLabel><select aria-label={label} required disabled={disabled} className={E.select} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onChange={(event) => onChange?.(event.target.value)}>
    <option value="">Select {label.toLowerCase()}</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
  </select></Field>
);

export function RepackView({ model, footer, messages, onParent, onLocation, onBin, onQuantity, submitting = false, disabled = false }: {
  model: RepackViewModel; footer?: ReactNode; messages?: ReactNode;
  onParent?: (id: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void; onQuantity?: (value: string) => void;
  submitting?: boolean; disabled?: boolean;
}) {
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {model.parents ? pick("Break", model.parentSkuId, model.parents, onParent) : E.fld("Break", model.parent)}
      {model.locations
        ? <div className="grid grid-cols-2 gap-2">{pick("Location", model.locationId, model.locations, onLocation)}{pick("Bin", model.binId, model.bins ?? [], onBin, !model.locationId)}</div>
        : E.fld("Location · bin", model.location)}
      <Qty label="Quantity" value={model.qty} unit={model.unit} onChange={onQuantity} />
      {E.tape(model.tape)}
      {E.info(model.preview)}
      {E.fld("Damaged on break", model.damaged)}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : repackFooter(model, { submitting, disabled })}
  </>;
}
