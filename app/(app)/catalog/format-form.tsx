"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { FormatView } from "@/components/mgr/views/format";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { formatCommandInput, formatControls, formatSizing, toFormatViewProps, type FormatSnapshot, type FormatViewModel } from "@/lib/mgr/format-view";

export function FormatForm({ format, materials, contents, canCompose = false }: { format?: FormatSnapshot["format"]; materials?: ReactNode; contents?: ReactNode; canCompose?: boolean } = {}) {
  const router = useRouter();
  const initial = toFormatViewProps({ format: format ? { ...format, composed: format.composed || canCompose } : { id: "new", name: "", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: null } });
  const [model, setModel] = useState(initial);
  const patch = (next: Partial<FormatViewModel>) => setModel(previous => ({ ...previous, ...next }));
  const sizing = formatSizing(model);
  const form = useCommandForm("upsert_format", {
    build: () => formatCommandInput(model, format),
    reset: () => setModel(initial),
    onSuccess: data => { if (!format) router.push(`/catalog/formats/${(data as { id: string }).id}`); },
  });
  const controls = formatControls(model, patch);
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={format ? "Edit format" : "New format"} trigger={<Button variant="outline">{format ? "Edit format" : "New Format"}</Button>}>
    <FormatView model={model} controls={controls} editing={Boolean(format)} canCompose={!format || canCompose} materials={materials} contents={contents}
      onSubmit={event => { if (!sizing.valid) { event.preventDefault(); return; } void form.submit(event); }}
      messages={<CommandFormMessage error={form.error} />}
      footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !sizing.valid}>{form.submitting ? "Saving…" : format ? "Save format" : "Create format"}</Button></CommandFormFooter>}
    />
  </CommandForm>;
}
