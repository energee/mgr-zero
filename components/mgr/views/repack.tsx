// components/mgr/views/repack.tsx — the Repack sheet. The inventory draws the
// fixture read-only; the live sheet (packaging/repack-form.tsx) puts option
// lists and ids on the model and passes callbacks, and the same fields become
// the parent, location, bin and lot pickers and a typed quantity. The "into"
// leg is never typed: it is derived (lib/mgr/repack-view.ts). Repack has no
// damage input, and the sheet says so rather than drawing an empty field (#1125).
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { Qty } from "@/components/mgr/qty";
import type { RepackOption, RepackViewModel } from "@/lib/mgr/repack-view";

type FooterProps = { formId?: string; submitting?: boolean; disabled?: boolean };

/** The pinned commit: withheld with the reason when the picked parent has no single composition row. */
export function repackFooter(model: RepackViewModel, props: FooterProps = {}) {
  return E.pin(model.unavailable ? E.gated("Confirm repack", model.unavailable) : <IrreversibleSubmit label="Confirm repack" busy="Recording…" {...props} />);
}

const pick = (label: string, value: string | undefined, options: RepackOption[], onChange?: (id: string) => void, disabled = false) => (
  E.pick(label, String(value ?? ""), [{ value: "", label: "Select " + (label.toLowerCase()) }, ...(options.map((o) => ({ value: o.id, label: o.name })))], { onChange, disabled, required: true, "aria-label": label })
);

export function RepackView({ model, footer, messages, onParent, onLocation, onBin, onLot, onQuantity, submitting = false, disabled = false }: {
  model: RepackViewModel; footer?: ReactNode; messages?: ReactNode;
  onParent?: (id: string) => void; onLocation?: (id: string) => void; onBin?: (id: string) => void; onLot?: (id: string) => void; onQuantity?: (value: string) => void;
  submitting?: boolean; disabled?: boolean;
}) {
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {model.parents ? pick("Package to break down", model.parentSkuId, model.parents, onParent) : E.fld("Package to break down", model.parent)}
      {model.locations
        ? <div className="grid grid-cols-2 gap-2">{pick("Location", model.locationId, model.locations, onLocation)}{pick("Bin", model.binId, model.bins ?? [], onBin, !model.locationId)}</div>
        : E.fld("Location · bin", model.location)}
      {/* The lot the cases come out of; empty is lot-less stock, which the RPC refuses when the bin holds lotted cases. */}
      {model.lots
        ? E.pick("Lot", model.lotId ?? "", [{ value: "", label: "Untracked stock" }, ...model.lots.map((o) => ({ value: o.id, label: o.name }))], { onChange: onLot, disabled: !model.binId, "aria-label": "Lot", "aria-describedby": "repack-untracked", description: <FieldDescription id="repack-untracked">Untracked stock is stock recorded without a lot. If this bin holds lotted packages, pick their lot.</FieldDescription> })
        : E.fld("Lot", model.lot ?? "")}
      <Qty label="Packages to repack" value={model.qty} unit={model.unit} onChange={onQuantity} />
      {E.tape(model.tape)}
      {E.info(model.preview)}
      {E.polite("Repack doesn’t record damage. The count it adds comes from the package’s composition.")}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : repackFooter(model, { submitting, disabled })}
  </>;
}
