"use client";

import { useState } from "react";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { validFormatRows } from "@/lib/format-edit-rules";

type Row = { id: string; qty: string; onBreak?: "consumed" | "return_to_stock" };

export function FormatRowsForm({ formatId, kind, initial, options }: {
  formatId: string; kind: "components" | "bom"; initial: Row[]; options: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState(initial);
  const [confirmClear, setConfirmClear] = useState(false);
  const bom = kind === "bom";
  const title = bom ? "Replace BOM" : "Replace components";
  const valid = validFormatRows(rows, options.map((o) => o.id), confirmClear);
  const form = useCommandForm(bom ? "replace_format_bom" : "replace_format_components", {
    build: () => bom ? { formatId, lines: rows.map((r) => ({ materialId: r.id, qtyPerUnit: Number(r.qty), onBreak: r.onBreak ?? "consumed" })) }
      : { formatId, components: rows.map((r) => ({ childFormatId: r.id, qty: Number(r.qty) })) },
    reset: () => { setRows(initial); setConfirmClear(false); },
  });
  function update(index: number, patch: Partial<Row>) {
    setRows(rows.map((r, n) => n === index ? { ...r, ...patch } : r));
  }
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={title} trigger={<button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" type="button">{title}</button>}>
    <form className="flex flex-col gap-4" onSubmit={(event) => { if (!valid) { event.preventDefault(); return; } void form.submit(event); }}>
      {E.info("Saving replaces the entire list. Remove a row to omit it from the saved list.")}
      <fieldset disabled={form.submitting} className="flex flex-col gap-4">
        {rows.map((row, index) => <div key={index} className="flex flex-col gap-2 rounded border p-3">
          <label className="flex flex-col gap-1">{bom ? "Material" : "Child format"} {index + 1}
            <select className="rounded border bg-background p-2" required value={row.id} onChange={(e) => update(index, { id: e.target.value })}>
              <option value="">Choose {bom ? "material" : "atomic packaged format"}</option>
              {options.map((o) => <option key={o.id} value={o.id} disabled={rows.some((r, n) => n !== index && r.id === o.id)}>{o.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">{bom ? "Quantity per unit" : "Quantity"} {index + 1}
            <input className="rounded border bg-background p-2" type="number" required min="0.000001" step="any" value={row.qty} onChange={(e) => update(index, { qty: e.target.value })} />
          </label>
          {bom ? <label className="flex flex-col gap-1">On break {index + 1}
            <select className="rounded border bg-background p-2" value={row.onBreak ?? "consumed"} onChange={(e) => update(index, { onBreak: e.target.value as Row["onBreak"] })}>
              <option value="consumed">Consumed</option><option value="return_to_stock">Return to stock</option>
            </select>
          </label> : null}
          <button type="button" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" aria-label={`Remove ${bom ? "material" : "component"} ${index + 1}`} onClick={() => { setRows(rows.filter((_, n) => n !== index)); setConfirmClear(false); }}>Remove</button>
        </div>)}
        <button type="button" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" onClick={() => { setRows([...rows, { id: "", qty: "", onBreak: "consumed" }]); setConfirmClear(false); }}>Add {bom ? "material" : "component"}</button>
        {rows.length === 0 ? <label className="flex items-start gap-2"><input type="checkbox" checked={confirmClear} onChange={(e) => setConfirmClear(e.target.checked)} />{bom ? "Clear all tracked packaging materials for this format." : "Clear all components. This format will have no volume and cannot hold stock."}</label> : null}
      </fieldset>
      {!valid && rows.length > 0 ? E.info("Choose a different item for each row and enter a positive quantity.") : null}
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" type="submit" disabled={form.submitting || !valid}>{form.submitting ? "Saving…" : title}</button></CommandFormFooter>
    </form>
  </CommandForm>;
}
