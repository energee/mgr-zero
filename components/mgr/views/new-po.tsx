"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/mgr/date-picker";
import { OrderQuantity } from "./new-order";
import type { NewPoViewModel } from "@/lib/mgr/new-po-view";

export type { NewPoViewModel };
export type NewPoControls = {
  vendor?: (value: string) => void; expected?: (value: string) => void;
  material?: (index: number, value: string) => void; quantity?: (index: number, value: string) => void;
  cost?: (index: number, value: string) => void; lot?: (index: number, value: string) => void;
  add?: () => void;
};

// A row the user has not begun is dropped on submit, so requiring its fields
// would block the form with no way to clear it (there is no Remove line).
const started = (line: NewPoViewModel["lines"][number]) => Boolean(line.materialId || line.qty || line.cost || line.lot);

export function NewPoView({ model, controls = {}, messages, footer, submitting = false, disabled = false }: {
  model: NewPoViewModel; controls?: NewPoControls; messages?: ReactNode; footer?: ReactNode;
  submitting?: boolean; disabled?: boolean;
}) {
  return <>
    {E.back("Purchase orders", "New PO", undefined, model.backHref)}
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.pick("Vendor", model.vendor, [{ value: "", label: "Select vendor" }, ...((model.vendors ?? [{ id: model.vendor, name: model.vendor }]).map(vendor => ({ value: vendor.id, label: vendor.name })))], { onChange: controls.vendor, required: true })}
      <DatePicker label="Expected" value={controls.expected ? model.expected : undefined} defaultValue={model.expected} onChange={controls.expected} />
      {model.lines.map((line, index) => <Fragment key={line.key}>
        {E.line(
          E.pick(`Line ${index + 1} material`, controls.material ? line.materialId ?? "" : line.materialId ?? line.key, [{ value: "", label: "Select material" }, ...((model.materials ?? [{ id: line.key, name: line.title, purchase_uom: "", lot_tracked: line.lot !== undefined }]).map(material => ({ value: material.id, label: material.name + (material.purchase_uom ? ` · ${material.purchase_uom}` : "") })))], { onChange: controls.material ? (nextValue: string) => controls.material?.(index, nextValue) : undefined, required: started(line), hideLabel: true }),
          line.detail,
          <OrderQuantity label={`Line ${index + 1} quantity`} required={started(line)} value={line.qty} onChange={controls.quantity && (value => controls.quantity?.(index, value))} />,
          "", <>
            {E.edit("Unit cost", controls.cost ? line.cost : line.cost.replace(/^\$/, ""), "number", undefined, { onChange: controls.cost ? (nextValue: string) => controls.cost?.(index, nextValue) : undefined, min: "0", step: "0.01", placeholder: "Unit cost ($)", "aria-label": `Line ${index + 1} unit cost` })}
            {line.lot !== undefined && E.edit("Expected lot", line.lot, "text", undefined, { onChange: controls.lot ? (nextValue: string) => controls.lot?.(index, nextValue) : undefined, "aria-label": `Line ${index + 1} expected lot` })}
          </>
        )}
      </Fragment>)}
      <Button type="button" variant="ghost" className="w-fit" onClick={controls.add}>Add line</Button>
    </fieldset>
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" disabled={submitting || disabled}>{submitting ? "Saving…" : "Save draft"}</Button>}
  </>;
}
