// components/mgr/views/format.tsx — Format sheet drawing (inventory). Live
// create stays format-form.tsx: E.edit is not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { VolumeField } from "@/components/mgr/volume-field";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FormatViewModel } from "@/lib/mgr/format-view";

export type { FormatViewModel };

type Controls = Partial<Record<"name" | "packageType" | "kegSize" | "unitsPerCase" | "volumeValue", (value: string) => void>> & {
  volumeUnit?: (unit: string) => void;
};

function FormatInput({ label, value, onChange, number }: { label: string; value: string; onChange?: (value: string) => void; number?: boolean }) {
  return <Field><FieldLabel>{label}</FieldLabel><Input aria-label={label} type={number ? "number" : "text"} min={number ? 1 : undefined} step={number ? 1 : undefined} value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onChange={(event) => onChange?.(event.target.value)} /></Field>;
}

function FormatSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange?: (value: string) => void }) {
  return <Field><FieldLabel>{label}</FieldLabel><Select value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option} value={option}>{option.replaceAll("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}

export function FormatView({
  model,
  createAction,
  controls = {},
  messages,
  footer,
}: {
  model: FormatViewModel;
  createAction?: ReactNode;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {createAction}
      <FormatInput label="Format name" value={model.name} onChange={controls.name} />
      {E.fld("Basis", model.basis)}
      {E.info("Create a brand-owned glass using New pour beside its brand in Catalog.")}
      <FormatSelect label="Package" value={model.packageType} options={model.packageOptions} onChange={controls.packageType} />
      {model.packageType === "keg" ? <FormatSelect label="Keg size" value={model.kegSize} options={model.kegSizeOptions} onChange={controls.kegSize} /> : null}
      <FormatInput label="Units per case · optional" value={model.unitsPerCase} onChange={controls.unitsPerCase} number />
      <VolumeField value={model.volumeValue} units={model.volumeUnits} on={model.volumeUnitIndex} onValueChange={controls.volumeValue} onUnitChange={controls.volumeUnit} />
      {E.info(model.composedInfo)}
      {E.ttl("Packaging BOM")}
      {E.tbl(
        ["Material", "Qty", "On break"],
        model.bom.map((line) => [line.material, line.qty, line.onBreak]),
      )}
      {E.info(model.bomInfo)}
      {messages}
      {footer !== undefined ? footer : E.btn("Save format")}
    </>
  );
}
