// components/mgr/views/new-po.tsx — shared New PO page body. A typed quantity
// or unit cost the PO cannot take is marked at its field (poLineErrors) once
// the user leaves either one, an empty vendor or material list says where to
// add one, and Save draft names what it still needs (`reason`, from newPoReason).
"use client";
import { Fragment, useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/mgr/date-picker";
import { LineErrorMessages, lineErrorIds, OrderQuantity } from "./new-order";
import { poLineErrors, type NewPoViewModel } from "@/lib/mgr/new-po-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

export type { NewPoViewModel };
export type NewPoControls = {
  vendor?: (value: string) => void; expected?: (value: string) => void;
  material?: (index: number, value: string) => void; quantity?: (index: number, value: string) => void;
  cost?: (index: number, value: string) => void; lot?: (index: number, value: string) => void;
  add?: () => void; remove?: (index: number) => void;
};

export function NewPoView({ model, controls = {}, messages, footer, submitting = false, reason }: {
  model: NewPoViewModel; controls?: NewPoControls; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean; reason?: string | null;
}) {
  const id = useId();
  const touched = useTouchedLines(!controls.quantity);
  return <>
    {E.back("Purchase orders", "New PO", undefined, model.backHref)}
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.pick("Vendor", model.vendor, [{ value: "", label: "Select vendor" }, ...((model.vendors ?? [{ id: model.vendor, name: model.vendor }]).map(vendor => ({ value: vendor.id, label: vendor.name })))], { onChange: controls.vendor, required: true, id: `${id}-vendor`, empty: { text: "No vendors yet.", label: "Add a vendor", href: model.vendorsHref, to: "Vendors" } })}
      <DatePicker label="Expected" value={controls.expected ? model.expected : undefined} defaultValue={model.expected} onChange={controls.expected} />
      {model.lines.map((line, index) => {
        const cost = controls.cost ? line.cost : line.cost.replace(/^\$/, "");
        const errors = touched.shown(index) ? poLineErrors({ qty: line.qty, cost }) : {};
        const qtyErrorId = lineErrorIds(`${id}-${index}`, errors).qty;
        return <Fragment key={line.key}>
        {E.line(
          E.pick(`Line ${index + 1} material`, controls.material ? line.materialId ?? "" : line.materialId ?? line.key, [{ value: "", label: "Select material" }, ...((model.materials ?? [{ id: line.key, name: line.title, purchase_uom: "", lot_tracked: line.lot !== undefined }]).map(material => ({ value: material.id, label: material.name + (material.purchase_uom ? ` · ${material.purchase_uom}` : "") })))], { onChange: controls.material ? (nextValue: string) => controls.material?.(index, nextValue) : undefined, required: true, hideLabel: true, id: `${id}-material-${index}`, empty: { text: "No materials yet.", label: "Add a material", href: model.materialsHref, to: "Materials" } }),
          line.detail,
          <OrderQuantity label={`Line ${index + 1} quantity`} required invalid={Boolean(errors.qty)} errorId={qtyErrorId} onBlur={() => touched.touch(index)} value={line.qty} onChange={controls.quantity && (value => controls.quantity?.(index, value))} />,
          "", <>
            <LineErrorMessages id={`${id}-${index}`} errors={{ qty: errors.qty }} />
            {E.edit("Unit cost", cost, "number", undefined, { onChange: controls.cost ? (nextValue: string) => controls.cost?.(index, nextValue) : undefined, onBlur: () => touched.touch(index), min: "0", step: "0.01", placeholder: "Unit cost ($)", "aria-label": `Line ${index + 1} unit cost`, id: `${id}-cost-${index}`, error: errors.cost })}
            {line.lot !== undefined && E.edit("Expected lot", line.lot, "text", undefined, { onChange: controls.lot ? (nextValue: string) => controls.lot?.(index, nextValue) : undefined, "aria-label": `Line ${index + 1} expected lot` })}
          </>
        )}
        {model.lines.length > 1 && <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => { controls.remove?.(index); touched.remove(index); }}>Remove</Button>}
      </Fragment>;
      })}
      <Button type="button" variant="ghost" className="w-fit" onClick={controls.add}>Add line</Button>
    </fieldset>
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : E.submit("Save draft", { submitting, reason })}
  </>;
}
