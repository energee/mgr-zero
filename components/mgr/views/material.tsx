// components/mgr/views/material.tsx — shared Material sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MaterialViewModel } from "@/lib/mgr/material-view";

export type { MaterialViewModel };

type Controls = Partial<Record<"name" | "kind" | "baseUnits" | "purchaseUnit" | "unit" | "defaultVendorId", (value: string) => void>> & {
  lotTracked?: (value: boolean) => void;
  active?: (value: boolean) => void;
};

const pick = (label: string, value: string, options: { value: string; label: string }[], change?: (value: string) => void) => (
  <Field key={label}><FieldLabel>{label}</FieldLabel><Select value={change ? value : undefined} defaultValue={change ? undefined : value} onValueChange={change}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></Field>
);

export function MaterialView({ model, controls = {}, messages, footer }: { model: MaterialViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode }) {
  const factor = Number(model.baseUnits) || 0;
  return (
    <>
      <Field><FieldLabel>Material name</FieldLabel><Input aria-label="Material name" value={controls.name ? model.name : undefined} defaultValue={controls.name ? undefined : model.name} onChange={(event) => controls.name?.(event.target.value)} required={Boolean(controls.name)} /></Field>
      {pick("Kind", model.kind, model.kindOptions.map((value) => ({ value, label: value })), controls.kind)}
      {E.inline(
        <Field key="factor"><FieldLabel>Base units</FieldLabel><ButtonGroup><Button type="button" variant="outline" size="icon" aria-label="Decrease" onClick={() => controls.baseUnits?.(String(Math.max(0, factor - 1)))}>−</Button><Input aria-label="Base units" type="number" inputMode="decimal" min={0} step="any" className="w-14 appearance-none text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={controls.baseUnits ? model.baseUnits : undefined} defaultValue={controls.baseUnits ? undefined : model.baseUnits} onChange={(event) => controls.baseUnits?.(event.target.value)} /><Button type="button" variant="outline" size="icon" aria-label="Increase" onClick={() => controls.baseUnits?.(String(factor + 1))}>+</Button></ButtonGroup></Field>,
        pick("Purchase unit", model.purchaseUnit, model.purchaseUnitOptions.map((value) => ({ value, label: value })), controls.purchaseUnit),
        pick("Unit", model.unit, model.unitOptions.map((value) => ({ value, label: value })), controls.unit),
      )}
      {E.info("A 44 lb box is purchase unit each with 44 base units, not a “box” unit: the schema has one unit vocabulary and packaging is the factor.")}
      {pick("Default vendor · optional", model.defaultVendorId || NONE, [{ value: NONE, label: "None" }, ...model.defaultVendorOptions.map(({ id, label }) => ({ value: id, label }))], controls.defaultVendorId && ((value) => controls.defaultVendorId!(value === NONE ? "" : value)))}
      {E.row("Lot-tracked", "receipts name a lot · consumption picks one", <Switch checked={controls.lotTracked ? model.lotTracked : undefined} defaultChecked={controls.lotTracked ? undefined : model.lotTracked} onCheckedChange={controls.lotTracked} aria-label="Lot-tracked" />, "ok")}
      {E.row("Active", "available to recipes and purchase orders", <Switch checked={controls.active ? model.active : undefined} defaultChecked={controls.active ? undefined : model.active} onCheckedChange={controls.active} aria-label="Material active" />, "ok")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save material")}
    </>
  );
}
