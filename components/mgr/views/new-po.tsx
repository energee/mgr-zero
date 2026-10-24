// Shared full-page purchase-order draft for the live app and screen inventory.
"use client";
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/mgr/date-picker";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { poLineErrors, type NewPoViewModel } from "@/lib/mgr/new-po-view";
import { noMaterialsPick } from "@/lib/mgr/materials-view";
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
  // Without live quantity callbacks, inventory snapshots show their errors immediately.
  const touched = useTouchedLines(!controls.quantity);
  // Inventory snapshots may omit option lists; their displayed value remains selectable.
  const vendors = model.vendors ?? [{ id: model.vendor, name: model.vendor }];
  const vendorOptions = [{ value: "", label: "Select vendor" }, ...vendors.map(vendor => ({ value: vendor.id, label: vendor.name }))];
  return <>
    {E.back("Purchase orders", "New PO", <Badge variant="secondary">Draft</Badge>, model.backHref)}
    <p className="text-sm text-muted-foreground">Build a vendor order. Save a draft before sending.</p>
    <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-6">
      <section aria-labelledby={`${id}-details`} className="rounded-xl border bg-card p-4 md:p-5">
        <h2 id={`${id}-details`} className="mb-4 text-base font-semibold">Order details</h2>
        <FieldGroup className="grid gap-4 md:grid-cols-[2fr_1fr]">
          {E.pick("Vendor", model.vendor, vendorOptions, {
            onChange: controls.vendor, required: true, id: `${id}-vendor`,
            empty: { text: "No vendors yet.", label: "Add a vendor", href: model.vendorsHref, to: "Vendors" },
          })}
          <DatePicker label="Expected · optional" value={controls.expected ? model.expected : undefined} defaultValue={model.expected} onChange={controls.expected} />
        </FieldGroup>
      </section>
      <section aria-labelledby={`${id}-materials`} className="flex min-w-0 flex-col gap-3">
        <div>
          <h2 id={`${id}-materials`} className="text-base font-semibold">Materials</h2>
          <p className="mt-1 text-sm text-muted-foreground">Order in purchase units. Cost and expected lot are optional.</p>
        </div>
        {model.lines.map((line, index) => {
          // Inventory snapshots format money; editable numeric fields use dollars only.
          const cost = controls.cost ? line.cost : line.cost.replace(/^\$/, "");
          const errors = touched.shown(index) ? poLineErrors({ qty: line.qty, cost }) : {};
          const materials = model.materials ?? [{ id: line.key, name: line.title, purchase_uom: "" }];
          const materialOptions = [{ value: "", label: "Select material" }, ...materials.map(material => ({
            value: material.id,
            label: material.name + (material.purchase_uom ? ` · ${material.purchase_uom}` : ""),
          }))];
          const selectedMaterial = controls.material ? line.materialId ?? "" : line.materialId ?? line.key;
          return <section key={line.key} aria-labelledby={`${id}-line-${index}`} className="min-w-0 rounded-xl border bg-card p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 id={`${id}-line-${index}`} className="text-sm font-semibold">Line {index + 1}</h3>
              {model.lines.length > 1 && <Button type="button" variant="ghost" size="sm" aria-describedby={`${id}-line-${index}`} onClick={() => {
                controls.remove?.(index);
                touched.remove(index);
              }}>Remove</Button>}
            </div>
            <FieldGroup className="grid min-w-0 grid-cols-1 gap-4 min-[390px]:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 min-[390px]:col-span-2 lg:col-span-1">
                {E.pick("Material", selectedMaterial, materialOptions, {
                  onChange: controls.material ? value => controls.material?.(index, value) : undefined,
                  required: true, "aria-label": `Line ${index + 1} material`, id: `${id}-material-${index}`,
                  empty: noMaterialsPick(model.materialsHref),
                })}
                {line.detail && <p className="mt-2 text-xs text-muted-foreground">{line.detail}</p>}
              </div>
              {E.edit("Quantity", String(line.qty), "number", undefined, {
                required: true, min: 0, step: "any", id: `${id}-qty-${index}`, "aria-label": `Line ${index + 1} quantity`,
                onBlur: () => touched.touch(index),
                onChange: controls.quantity ? value => controls.quantity?.(index, value) : undefined,
                error: errors.qty,
              })}
              {E.edit("Unit cost ($)", cost, "number", undefined, {
                onChange: controls.cost ? value => controls.cost?.(index, value) : undefined,
                onBlur: () => touched.touch(index),
                min: "0", step: "0.01", placeholder: "Optional", id: `${id}-cost-${index}`, "aria-label": `Line ${index + 1} unit cost`,
                error: errors.cost,
              })}
            </FieldGroup>
            {line.lot !== undefined && <div className="mt-4 flex flex-col gap-4">
              <Separator />
              {E.edit("Expected lot · optional", line.lot, "text", undefined, {
                onChange: controls.lot ? value => controls.lot?.(index, value) : undefined,
                id: `${id}-lot-${index}`, "aria-label": `Line ${index + 1} expected lot`,
                "aria-describedby": `${id}-lot-hint-${index}`, placeholder: "Lot named by the vendor",
              })}
              <p id={`${id}-lot-hint-${index}`} className="mt-2 text-xs text-muted-foreground">A reference for receiving. Confirm the actual lot on the package when it arrives.</p>
            </div>}
          </section>;
        })}
        <Button type="button" variant="outline" className="w-full border-dashed" onClick={controls.add}>Add line</Button>
      </section>
    </fieldset>
    {messages}
    {E.sp()}
    <Separator />
    <p className="text-sm text-muted-foreground">Saving a draft does not send the order or add stock.</p>
    {footer !== undefined ? footer : E.pin(E.submit("Save draft", { submitting, reason }))}
  </>;
}
