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
      {rows.map((row, index) => <div key={index} className="flex flex-col gap-2 border-b pb-3">
        <label className="flex flex-col gap-1">{bom ? "Material" : "Package"} {index + 1}
          <select className="rounded border bg-background p-2" required value={row.id} onChange={event => update(index, { id: event.target.value })}>
            <option value="">Choose {bom ? "material" : "package"}</option>
            {options.map(option => <option key={option.id} value={option.id} disabled={rows.some((r, n) => n !== index && r.id === option.id)}>{option.name}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <label className="flex flex-1 flex-col gap-1">Quantity {index + 1}<input className="w-full rounded border bg-background p-2" type="number" required min="0.000001" step="any" value={row.qty} onChange={event => update(index, { qty: event.target.value })} /></label>
          <button type="button" data-preview-action className="rounded-md px-3 py-2 text-sm hover:bg-accent" aria-label={`Remove ${bom ? "material" : "component"} ${index + 1}`} onClick={() => { onChange(rows.filter((_, n) => n !== index)); onConfirmClear(false); }}>Remove</button>
        </div>
        {bom && <label className="flex flex-col gap-1">When unpacked {index + 1}<select className="rounded border bg-background p-2" value={row.onBreak ?? "consumed"} onChange={event => update(index, { onBreak: event.target.value as FormatRow["onBreak"] })}><option value="consumed">Used up</option><option value="return_to_stock">Return to stock</option></select></label>}
      </div>)}
      <button type="button" data-preview-action className="rounded-md border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50" disabled={options.length === 0} onClick={() => { onChange([...rows, { id: "", qty: "", onBreak: "consumed" }]); onConfirmClear(false); }}>Add {bom ? "material" : "component"}</button>
      {rows.length === 0 && options.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" checked={confirmClear} onChange={event => onConfirmClear(event.target.checked)} />{bom ? "Clear all tracked packaging materials for this format." : "Clear all components. This format will have no volume and cannot hold stock."}</label>}
    </fieldset>
    {rows.some(row => !row.id || !(Number(row.qty) > 0)) && E.info("Choose a different item for each row and enter a positive quantity.")}
  </>;
}
