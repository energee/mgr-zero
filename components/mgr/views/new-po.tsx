"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
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
      <Field><FieldLabel>Vendor</FieldLabel>
        <select aria-label="Vendor" required className="min-h-9 w-full rounded border bg-background p-2" value={controls.vendor ? model.vendor : undefined} defaultValue={controls.vendor ? undefined : model.vendor} onChange={event => controls.vendor?.(event.target.value)}>
          <option value="">Select vendor</option>
          {(model.vendors ?? [{ id: model.vendor, name: model.vendor }]).map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>
      </Field>
      <DatePicker label="Expected" value={controls.expected ? model.expected : undefined} defaultValue={model.expected} onChange={controls.expected} />
      {model.lines.map((line, index) => <Fragment key={line.key}>
        {E.line(
          <select aria-label={`Line ${index + 1} material`} required={started(line)} className="min-h-9 w-full min-w-0 rounded border bg-background p-2" value={controls.material ? line.materialId ?? "" : undefined} defaultValue={controls.material ? undefined : line.materialId ?? line.key} onChange={event => controls.material?.(index, event.target.value)}>
            <option value="">Select material</option>
            {(model.materials ?? [{ id: line.key, name: line.title, purchase_uom: "", lot_tracked: line.lot !== undefined }]).map(material => <option key={material.id} value={material.id}>{material.name}{material.purchase_uom ? ` · ${material.purchase_uom}` : ""}</option>)}
          </select>,
          line.detail,
          <OrderQuantity label={`Line ${index + 1} quantity`} required={started(line)} value={line.qty} onChange={controls.quantity && (value => controls.quantity?.(index, value))} />,
          "", <>
            <Field><FieldLabel>Unit cost</FieldLabel><Input aria-label={`Line ${index + 1} unit cost`} type="number" min="0" step="0.01" placeholder="Unit cost ($)" value={controls.cost ? line.cost : undefined} defaultValue={controls.cost ? undefined : line.cost.replace(/^\$/, "")} onChange={event => controls.cost?.(index, event.target.value)} /></Field>
            {line.lot !== undefined && <Field><FieldLabel>Expected lot</FieldLabel><Input aria-label={`Line ${index + 1} expected lot`} value={controls.lot ? line.lot : undefined} defaultValue={controls.lot ? undefined : line.lot} onChange={event => controls.lot?.(index, event.target.value)} /></Field>}
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
