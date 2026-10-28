// components/mgr/views/sku.tsx — SKU sheet drawing, shared by the inventory
// record, sku-form.tsx (create), SkuEditForm (edit) and pour-form.tsx (a pour, locked). The live forms
// pass `controls` to take the fields over; everything visible is drawn here.
"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RegistryInput, RegistrySelect } from "@/components/mgr/views/registry-fields";
import { Switch } from "@/components/ui/switch";
import { pourOuncesError, type SkuViewModel } from "@/lib/mgr/sku-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

export type { SkuViewModel };

/** The serving-size field's useTouchedLines slot. */
const OUNCES = 0;

type Controls = {
  pourName?: (value: string) => void;
  ounces?: (value: string) => void;
  format?: (value: string) => void;
  active?: (value: boolean) => void;
  upc?: (value: string) => void;
  batchSharePercent?: (value: string) => void;
  kegPool?: (value: string) => void;
};

export function SkuView({
  model,
  controls = {},
  /** A SKU already in use cannot change format; create another SKU instead. */
  locked,
  /** `null` drops the row: live create has no active flag, a new SKU is active. */
  activeRow,
  /** Live create adds its optional Name here. */
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
  // New SKU is packaged; a pour is created and edited on its price group (PourForm, locked).
  const kind = model.kind ?? "packaged";
  // The serving-size error waits until the field is left; an inventory fixture shows it at once.
  const touched = useTouchedLines(!controls.ounces);
  const ouncesError = kind === "poured" && touched.shown(OUNCES) ? pourOuncesError(model.ounces ?? "") : undefined;
  return (
    <>
      {locked ? E.fld("Type", kind === "poured" ? "Pour" : "Packaged") : null}
      {kind === "poured" ? <>
        {E.edit("Serving size · oz", model.ounces ?? "", "text", undefined, { id: "pour-ounces", onChange: controls.ounces, onBlur: () => touched.touch(OUNCES), error: ouncesError, inputMode: "decimal", required: Boolean(controls.ounces) })}
        <details open={model.pourName ? true : undefined}><summary className="cursor-pointer text-sm font-medium">Rename · optional</summary><div className="pt-3"><RegistryInput label="Name" value={model.pourName ?? ""} onChange={controls.pourName} placeholder={Number(model.ounces) > 0 ? `${Number(model.ounces)} oz pour` : "Pint"} /></div></details>
        {E.info("A pour is a non-stock SKU. Its serving volume is drawn from a keg; glasses are not held as inventory.")}
      </> : <>
      {locked
        ? E.fld("Format", model.format)
        : <RegistrySelect label="Format" value={model.format} options={model.formatOptions.map((name) => ({ value: name, label: name }))} onChange={controls.format} />}
      {activeRow !== undefined
        ? activeRow
        : E.row("Active", "available to price and sell",
          <Switch checked={controls.active ? model.active : undefined} defaultChecked={controls.active ? undefined : model.active} onCheckedChange={controls.active} aria-label="Active" />)}
      {fields}
      <RegistryInput label="UPC (optional)" value={model.upc} onChange={controls.upc} />
      {model.showKegPool ? <>{E.pick("Keg pool", model.kegPool ?? "", model.kegPoolOptions ?? [{ value: "", label: "None" }], { onChange: controls.kegPool })}{E.info("Wholesale orders charge this pool's deposit per keg. None charges no deposit.")}</> : null}
      {model.batchSharePercent !== undefined ? <>
        {E.edit("Batch package share (%)", model.batchSharePercent, "number", undefined, { onChange: controls.batchSharePercent, min: 0, max: 100, step: "any", "aria-invalid": model.batchSharePercent.trim() !== "" && !(Number(model.batchSharePercent) > 0 && Number(model.batchSharePercent) <= 100) })}
        {E.info("Use more than 0% and at most 100% of a batch's volume for this SKU. All SKU shares for a brand together may not exceed 100%. Clear to stop projecting packaging materials for this SKU.")}
      </> : E.info("Edit the SKU after creation to set its batch package share for projected packaging materials.")}
      {E.info(model.volumeInfo)}
      </>}
      {messages}
      {footer !== undefined ? footer : E.btn("Save SKU")}
    </>
  );
}
