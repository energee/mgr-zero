"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { FormatRowsView, type FormatRow as Row } from "@/components/mgr/views/format-rows";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { validFormatRows } from "@/lib/format-edit-rules";

/** Embedded inside the Edit format sheet; it is the one owner of contents and materials edits. */
export function FormatRowsForm({ formatId, kind, initial, options }: {
  formatId: string; kind: "components" | "bom"; initial: Row[]; options: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState(initial);
  const [confirmClear, setConfirmClear] = useState(false);
  const bom = kind === "bom";
  const valid = validFormatRows(rows, options.map((o) => o.id), confirmClear);
  const form = useCommandForm(bom ? "replace_format_bom" : "replace_format_components", {
    build: () => bom ? { formatId, lines: rows.map((r) => ({ materialId: r.id, qtyPerUnit: Number(r.qty), onBreak: r.onBreak ?? "consumed" })) }
      : { formatId, components: rows.map((r) => ({ childFormatId: r.id, qty: Number(r.qty) })) },
    reset: () => { setRows(initial); setConfirmClear(false); },
  });
  return <form className="flex flex-col gap-4" onSubmit={(event) => { if (!valid) { event.preventDefault(); return; } void form.submit(event); }}>
      <FormatRowsView kind={kind} rows={rows} options={options} valid={valid} onChange={setRows} confirmClear={confirmClear} onConfirmClear={setConfirmClear} disabled={form.submitting} addHref={bom ? "/materials" : "/catalog"} />
      <CommandFormMessage error={form.error} />
      <CommandFormFooter>{E.btn(form.submitting ? "Saving…" : bom ? "Save materials" : "Save contents", form.submitting || !valid ? "g disabled" : "g")}</CommandFormFooter>
    </form>;
}
