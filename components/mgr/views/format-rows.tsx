"use client";

import { E } from "@/components/mgr/e";

export type FormatRow = { id: string; qty: string; onBreak?: "consumed" | "return_to_stock" };
export function FormatRowsView({ kind, rows, options, valid, onChange, confirmClear, onConfirmClear, disabled, addHref }: {
  kind: "bom" | "components";
  rows: FormatRow[];
  options: { id: string; name: string }[];
  /** validFormatRows(rows, options, confirmClear), computed by the owner of Save. */
  valid: boolean;
  onChange: (rows: FormatRow[]) => void;
  confirmClear: boolean;
  onConfirmClear: (value: boolean) => void;
  disabled?: boolean;
  addHref?: string;
}) {
  const bom = kind === "bom";
  const update = (index: number, patch: Partial<FormatRow>) => onChange(rows.map((row, n) => n === index ? { ...row, ...patch } : row));
  return <>
    {options.length === 0 ? <p className="text-sm text-muted-foreground">{bom ? "No materials have been added yet. " : "No eligible smaller packages exist yet. "}<a className="underline" href={addHref ?? "#"}>{bom ? "Add a material" : "Create a package format"}</a>, then return here.</p> : <p className="text-sm text-muted-foreground">{bom ? "Materials used for each complete package. Save materials separately from sizing." : "Smaller packages inside this one. Save contents to calculate its volume."}</p>}
    <fieldset disabled={disabled} data-preview-action className="flex flex-col gap-4">
      {rows.map((row, index) => <div key={index} className="flex flex-col gap-2 pb-3" role="group" aria-label={`${bom ? "Material" : "Package"} ${index + 1}`}>
        {E.pick(`${bom ? "Material" : "Package"} ${index + 1}`, row.id, [
          { value: "", label: `Choose ${bom ? "material" : "package"}` },
          ...options.map(option => ({ value: option.id, label: option.name, disabled: rows.some((r, n) => n !== index && r.id === option.id) })),
        ], { required: true, disabled, onChange: id => update(index, { id }), displayValue: options.find(option => option.id === row.id)?.name })}
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">{E.edit(`Quantity ${index + 1}`, row.qty, "number", undefined, { required: true, disabled, min: 0.000001, step: "any", onChange: qty => update(index, { qty }) })}</div>
          {E.btn("Remove", "ghost", undefined, () => { onChange(rows.filter((_, n) => n !== index)); onConfirmClear(false); })}
        </div>
        {bom && E.pick(`When unpacked ${index + 1}`, row.onBreak ?? "consumed", [{ value: "consumed", label: "Used up" }, { value: "return_to_stock", label: "Return to stock" }], { disabled, onChange: onBreak => update(index, { onBreak: onBreak as FormatRow["onBreak"] }), displayValue: row.onBreak === "return_to_stock" ? "Return to stock" : "Used up" })}
      </div>)}
      {E.btn(`Add ${bom ? "material" : "component"}`, options.length === 0 ? "g disabled" : "g", undefined, () => { onChange([...rows, { id: "", qty: "", onBreak: "consumed" }]); onConfirmClear(false); })}
      {rows.length === 0 && options.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={confirmClear} onChange={event => onConfirmClear(event.target.checked)} />{bom ? "Clear all tracked packaging materials for this format." : "Clear all components. This format will have no volume and cannot hold stock."}</label>}
    </fieldset>
    {!valid && E.info("Choose a different item for each row and enter a positive quantity.")}
  </>;
}
