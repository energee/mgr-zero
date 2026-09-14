"use client";

import { useId, useState, type FormEventHandler, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { E } from "@/components/mgr/e";
import { FormatRowsView, type FormatRow } from "@/components/mgr/views/format-rows";
import { VolumeField } from "@/components/mgr/volume-field";
import { formatControls, formatSizing, type FormatViewModel } from "@/lib/mgr/format-view";

export type { FormatViewModel };

type Controls = Partial<ReturnType<typeof formatControls>>;

function FormatSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange?: (value: string) => void }) {
  const choices = options.map(option => ({ value: option, label: SIZE_LABEL[option] ?? (option === "custom" ? "Custom size" : option.charAt(0).toUpperCase() + option.slice(1).replaceAll("_", " ")) }));
  return E.pick(label, value, choices, { onChange, displayValue: choices.find(option => option.value === value)?.label });
}

export function FormatView({ model: supplied, createAction, controls: suppliedControls, messages, footer, onSubmit, materials, contents, editing = false, canCompose = !editing, componentOptions = [], componentRows, onComponentRowsChange, contentsOnly = false, formId }: {
  model: FormatViewModel;
  createAction?: ReactNode;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  materials?: ReactNode;
  contents?: ReactNode;
  editing?: boolean;
  canCompose?: boolean;
  componentOptions?: { id: string; name: string }[];
  componentRows?: FormatRow[];
  onComponentRowsChange?: (rows: FormatRow[]) => void;
  contentsOnly?: boolean;
  formId?: string;
}) {
  const generatedFormId = useId();
  const id = formId ?? generatedFormId;
  const [localComponents, setLocalComponents] = useState<FormatRow[]>([{ id: "", qty: "1" }]);
  const [bomRows, setBomRows] = useState<FormatRow[]>(() => supplied.bom.map(line => ({ id: line.material, qty: line.qty, onBreak: line.onBreak === "consumed" ? "consumed" : "return_to_stock" })));
  const [confirmClear, setConfirmClear] = useState(false);
  const [local, setLocal] = useState(supplied);
  const model = suppliedControls ? supplied : local;
  const patch = (next: Partial<FormatViewModel>) => setLocal(previous => ({ ...previous, ...next }));
  const controls: Controls = suppliedControls ?? formatControls(model, patch);
  const sizing = formatSizing(model);
  const keg = model.packageType === "keg";
  if (contentsOnly) return <div className="flex flex-col gap-4">
    {E.fld("Format", model.name)}
    <p className="text-sm text-muted-foreground">Format created. Review the selected packages and save contents to finish. Closing now keeps the format available to finish later.</p>
    {contents}
  </div>;
  return <>
    {createAction}
    <form id={id} onSubmit={onSubmit ?? (event => event.preventDefault())} className="flex flex-col gap-4">
      {!editing && <div className="flex flex-wrap gap-2" aria-label="Common formats">
        {[["half_bbl", "½ bbl keg"], ["sixth_bbl", "⅙ bbl keg"], ["case", "24 × 16 oz cans"]].map(([value, label]) => <button key={value} type="button" data-preview-action className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent" onClick={() => controls.preset?.(value)}>{label}</button>)}
      </div>}
      <FormatSelect label="Container" value={model.packageType} options={model.packageOptions} onChange={controls.packageType} />
      {model.composed ? E.fld("Total beer volume", "Calculated from package contents") : <>
        {keg && <FormatSelect label="Keg size" value={model.kegSize} options={model.kegSizeOptions} onChange={controls.kegSize} />}
        {(!keg || model.kegSize === "custom") && <div className="flex flex-col gap-4">
          <VolumeField label={keg ? "Custom keg volume" : "Size of one container"} value={model.volumeValue} units={model.volumeUnits} on={model.volumeUnitIndex} onValueChange={controls.volumeValue} onUnitChange={controls.volumeUnit} />
          {!keg && E.edit("Containers per package", model.unitsPerCase, "number", undefined, { onChange: controls.unitsPerCase, min: 1, step: 1, required: true, "aria-label": "Containers per package" })}
        </div>}
        {sizing.valid && <div className="py-3" aria-live="polite"><p className="text-xs text-muted-foreground">Beer per package</p><p className="text-lg font-medium tabular-nums">{sizing.volumeLabel}</p></div>}
      </>}
      <details open={model.name || model.composed ? true : undefined}>
        <summary className="cursor-pointer text-sm font-medium">{model.composed ? "Format name · required" : model.name ? "Format name" : "Rename · optional"}</summary>
        <div className="pt-3">{E.edit("Format name", model.name, "text", undefined, { onChange: controls.name, required: model.composed, placeholder: sizing.valid ? sizing.name : "Name this format", "aria-label": "Format name" })}</div>
      </details>
      {!model.name && sizing.valid && <p className="text-sm text-muted-foreground">Saves as <strong className="font-medium text-foreground">{sizing.name}</strong></p>}
      {canCompose && <details className="pt-3"><summary className="cursor-pointer text-sm font-medium">Build from other packages</summary><label className="mt-3 flex items-center gap-2 text-sm">{E.sw(model.composed, "Calculate volume from smaller packages", controls.composed)}Calculate volume from smaller packages.</label></details>}
      {model.composed && !editing && <section className="flex flex-col gap-3 pt-3" aria-label="Package contents">
        <h3 className="text-sm font-medium">Package contents</h3>
        <FormatRowsView kind="components" rows={componentRows ?? localComponents} options={componentOptions} onChange={onComponentRowsChange ?? setLocalComponents} confirmClear={false} onConfirmClear={() => {}} />
        <p className="text-xs text-muted-foreground">Choose packages with their own volume; packages already built from contents cannot be nested. Create the format, then save these contents in the next step.</p>
      </section>}
      {editing && <p className="text-xs text-muted-foreground">Shared by every SKU using this format. Sizing changes affect future calculations and open plans; recorded movement volumes stay unchanged.</p>}
      {sizing.error && E.info(sizing.error)}
      {messages}
    </form>
    {model.composed && contents}
    <details className="pt-3">
      <summary className="cursor-pointer text-sm font-medium">Packaging materials · optional</summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        {materials !== undefined ? materials : model.bom.length ? <><FormatRowsView kind="bom" rows={bomRows} options={model.bom.map(line => ({ id: line.material, name: line.material }))} onChange={setBomRows} confirmClear={confirmClear} onConfirmClear={setConfirmClear} />{E.btn("Save materials")}</> : <p className="text-muted-foreground">Save the format first, then add trays, labels, or other materials here. Materials are optional.</p>}
      </div>
    </details>
    {footer !== undefined ? footer : <Button type="submit" form={id} className="w-full md:w-fit md:self-end">Save format</Button>}
  </>;
}
