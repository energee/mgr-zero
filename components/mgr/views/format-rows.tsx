"use client";

import { E } from "@/components/mgr/e";

export type FormatRow = { id: string; qty: string; onBreak?: "consumed" | "return_to_stock" };
export function FormatRowsView({ kind, rows, options, onChange, confirmClear, onConfirmClear, disabled, addHref }: {
  kind: "bom" | "components";
  rows: FormatRow[];
  options: { id: string; name: string }[];
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
    <fieldset disabled={disabled} className="flex flex-col gap-4">
      {rows.map((row, index) => <div key={index} className="flex flex-col gap-2 pb-3">
        {E.pick(`${bom ? "Material" : "Package"} ${index + 1}`, row.id, [
          { value: "", label: `Choose ${bom ? "material" : "package"}` },
          ...options.map(option => ({ value: option.id, label: option.name, disabled: rows.some((r, n) => n !== index && r.id === option.id) })),
        ], { required: true, disabled, onChange: id => update(index, { id }), displayValue: options.find(option => option.id === row.id)?.name })}
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">{E.edit(`Quantity ${index + 1}`, row.qty, "number", undefined, { required: true, disabled, min: 0.000001, step: "any", onChange: qty => update(index, { qty }) })}</div>
          <button type="button" data-preview-action className="rounded-md px-3 py-2 text-sm hover:bg-accent" aria-label={`Remove ${bom ? "material" : "component"} ${index + 1}`} onClick={() => { onChange(rows.filter((_, n) => n !== index)); onConfirmClear(false); }}>Remove</button>
        </div>
        {bom && E.pick(`When unpacked ${index + 1}`, row.onBreak ?? "consumed", [{ value: "consumed", label: "Used up" }, { value: "return_to_stock", label: "Return to stock" }], { disabled, onChange: onBreak => update(index, { onBreak: onBreak as FormatRow["onBreak"] }), displayValue: row.onBreak === "return_to_stock" ? "Return to stock" : "Used up" })}
      </div>)}
      <button type="button" data-preview-action className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50" disabled={options.length === 0} onClick={() => { onChange([...rows, { id: "", qty: "", onBreak: "consumed" }]); onConfirmClear(false); }}>Add {bom ? "material" : "component"}</button>
      {rows.length === 0 && options.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={confirmClear} onChange={event => onConfirmClear(event.target.checked)} />{bom ? "Clear all tracked packaging materials for this format." : "Clear all components. This format will have no volume and cannot hold stock."}</label>}
    </fieldset>
    {rows.some(row => !row.id || !(Number(row.qty) > 0)) && E.info("Choose a different item for each row and enter a positive quantity.")}
  </>;
}
