// components/mgr/views/repack.tsx — the Repack sheet. The inventory draws the
// fixture read-only; the live sheet (packaging/repack-form.tsx) puts option
// lists and ids on the model and passes callbacks, and the same fields become
// the parent, location, bin and lot pickers and a typed quantity. The "into"
// leg is never typed: it is derived (lib/mgr/repack-view.ts). Confirm repack
// names what it still needs (`reason`, from repackReason), and an empty Break
// list says how a SKU becomes breakable.
"use client";
import type { ReactNode } from "react";
import { E, type PickEmpty } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { Qty } from "@/components/mgr/qty";
import type { RepackOption, RepackViewModel } from "@/lib/mgr/repack-view";

type FooterProps = { formId?: string; submitting?: boolean; reason?: string | null };

/** The pinned commit: gated when the picked parent has no single composition
 *  row; otherwise Confirm repack, withheld while `reason` names what is missing. */
export function repackFooter(model: RepackViewModel, props: FooterProps = {}) {
  return E.pin(model.unavailable ? E.gated("Confirm repack", model.unavailable) : <IrreversibleSubmit label="Confirm repack" busy="Recording…" {...props} />);
}

const pick = (label: string, value: string | undefined, options: RepackOption[], onChange?: (id: string) => void, disabled = false, empty?: PickEmpty) => (
  E.pick(label, String(value ?? ""), [{ value: "", label: "Select " + (label.toLowerCase()) }, ...(options.map((o) => ({ value: o.id, label: o.name })))], { onChange, disabled, required: true, "aria-label": label, empty })
);

export function RepackView({ model, footer, messages, onParent, onLocation, onBin, onLot, onQuantity, submitting = false, reason }: {
  model: RepackViewModel; footer?: ReactNode; messages?: ReactNode;
  onParent?: (id: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void; onLot?: (id: string) => void; onQuantity?: (value: string) => void;
  submitting?: boolean; reason?: string | null;
}) {
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {model.parents ? pick("Break", model.parentSkuId, model.parents, onParent, false, { text: "No SKU can be broken yet: a SKU breaks when its format is made of another format.", label: "Open Formats", href: model.formatsHref, to: "Formats" }) : E.fld("Break", model.parent)}
      {model.locations
        ? <div className="grid grid-cols-2 gap-2">{pick("Location", model.locationId, model.locations, onLocation)}{pick("Bin", model.binId, model.bins ?? [], onBin, !model.locationId)}</div>
        : E.fld("Location · bin", model.location)}
      {/* The lot the cases come out of; empty is lot-less stock, which the RPC refuses when the bin holds lotted cases. */}
      {model.lots
        ? E.pick("Lot", model.lotId ?? "", [{ value: "", label: "Untracked stock" }, ...model.lots.map((o) => ({ value: o.id, label: o.name }))], { onChange: onLot, disabled: !model.binId, "aria-label": "Lot" })
        : E.fld("Lot", model.lot ?? "")}
      <Qty label="Quantity" value={model.qty} unit={model.unit} onChange={onQuantity} />
      {E.tape(model.tape)}
      {E.info(model.preview)}
      {E.fld("Damaged on break", model.damaged)}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : repackFooter(model, { submitting, reason })}
  </>;
}
