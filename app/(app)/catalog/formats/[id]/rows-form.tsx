"use client";

import { useState } from "react";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { FormatRowsView, type FormatRow as Row } from "@/components/mgr/views/format-rows";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { validFormatRows } from "@/lib/format-edit-rules";

export function FormatRowsForm({ formatId, kind, initial, options, triggerLabel, embedded = false }: {
  formatId: string; kind: "components" | "bom"; initial: Row[]; options: { id: string; name: string }[]; triggerLabel?: string; embedded?: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [confirmClear, setConfirmClear] = useState(false);
  const bom = kind === "bom";
  const title = bom ? "Edit materials" : "Edit contents";
  const valid = validFormatRows(rows, options.map((o) => o.id), confirmClear);
  const form = useCommandForm(bom ? "replace_format_bom" : "replace_format_components", {
    build: () => bom ? { formatId, lines: rows.map((r) => ({ materialId: r.id, qtyPerUnit: Number(r.qty), onBreak: r.onBreak ?? "consumed" })) }
      : { formatId, components: rows.map((r) => ({ childFormatId: r.id, qty: Number(r.qty) })) },
    reset: () => { setRows(initial); setConfirmClear(false); },
  });
  const body = <form className="flex flex-col gap-4" onSubmit={(event) => { if (!valid) { event.preventDefault(); return; } void form.submit(event); }}>
      <FormatRowsView kind={kind} rows={rows} options={options} onChange={setRows} confirmClear={confirmClear} onConfirmClear={setConfirmClear} disabled={form.submitting} addHref={bom ? "/materials" : "/catalog"} />
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" type="submit" disabled={form.submitting || !valid}>{form.submitting ? "Saving…" : bom ? "Save materials" : "Save contents"}</button></CommandFormFooter>
    </form>;
  return embedded ? body : <CommandForm open={form.open} onOpenChange={form.setOpen} title={title} trigger={<button className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50" type="button">{triggerLabel ?? title}</button>}>{body}</CommandForm>;
}
