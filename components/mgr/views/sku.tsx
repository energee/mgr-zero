// components/mgr/views/sku.tsx — SKU sheet drawing, shared by the inventory
// record and by sku-form.tsx (create) and SkuEditForm (edit). The live forms
// pass `controls` to take the fields over; everything visible is drawn here.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SkuViewModel } from "@/lib/mgr/sku-view";

export type { SkuViewModel };

type Controls = {
  format?: (value: string) => void;
  active?: (value: boolean) => void;
  upc?: (value: string) => void;
};

export function SkuView({
  model,
  controls = {},
  /** A SKU already in use cannot change format; create another SKU instead. */
  locked,
  /** Live create adds Name here; `null` drops the row (create has no active flag). */
  activeRow,
  fields,
  messages,
  footer,
}: {
  model: SkuViewModel;
  controls?: Controls;
  locked?: boolean;
  activeRow?: ReactNode;
  fields?: ReactNode;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {locked
        ? E.fld("Format", model.format)
        : (
          <Field>
            <FieldLabel>Format</FieldLabel>
            <Select value={controls.format ? model.format : undefined} defaultValue={controls.format ? undefined : model.format} onValueChange={controls.format}>
              <SelectTrigger aria-label="Format"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{model.formatOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
        )}
      {activeRow !== undefined
        ? activeRow
        : E.row("Active", "available to price and sell",
          <Switch checked={controls.active ? model.active : undefined} defaultChecked={controls.active ? undefined : model.active} onCheckedChange={controls.active} aria-label="Active" />)}
      {fields}
      <Field>
        <FieldLabel>UPC (optional)</FieldLabel>
        <Input aria-label="UPC (optional)" value={controls.upc ? model.upc : undefined} defaultValue={controls.upc ? undefined : model.upc} onChange={(event) => controls.upc?.(event.target.value)} />
      </Field>
      {E.info(model.volumeInfo)}
      {messages}
      {footer !== undefined ? footer : E.btn("Save SKU")}
    </>
  );
}
