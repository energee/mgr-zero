"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { FormatView } from "@/components/mgr/views/format";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { validFormatRows } from "@/lib/format-edit-rules";
import { formatCommandInput, formatControls, formatSizing, toFormatViewProps, type FormatSnapshot, type FormatViewModel } from "@/lib/mgr/format-view";

export function FormatForm({ format, materials, contents, deleteAction, canCompose = false, componentOptions = [] }: { format?: FormatSnapshot["format"]; materials?: ReactNode; contents?: ReactNode; deleteAction?: ReactNode; canCompose?: boolean; componentOptions?: { id: string; name: string }[] } = {}) {
  const router = useRouter();
  const formId = useId();
  const initial = toFormatViewProps({ format: format ? { ...format, composed: format.composed || canCompose } : { id: "new", name: "", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: null } });
  const [model, setModel] = useState(initial);
  const [components, setComponents] = useState([{ id: "", qty: "1" }]);
  const patch = (next: Partial<FormatViewModel>) => setModel(previous => ({ ...previous, ...next }));
  const sizing = formatSizing(model);
  const creatingComposed = !format && model.composed;
  const valid = sizing.valid && (!creatingComposed || validFormatRows(components, componentOptions.map(option => option.id), false));
  const form = useCommandForm(creatingComposed ? "create_composed_format" : "upsert_format", {
    build: () => creatingComposed ? { name: sizing.name, packageType: model.packageType, components: components.map(row => ({ childFormatId: row.id, qty: Number(row.qty) })) } : formatCommandInput(model, format),
    reset: () => { setModel(initial); setComponents([{ id: "", qty: "1" }]); },
    onSuccess: data => { if (!format) router.push(`/catalog/formats/${(data as { id: string }).id}`); },
  });
  const controls = formatControls(model, patch);
  return <CommandForm open={form.open} onOpenChange={next => { if (!form.submitting) form.setOpen(next); }} title={format ? "Edit format" : "New format"} trigger={<Button variant="outline">{format ? "Edit format" : "New Format"}</Button>}>
    <FormatView formId={formId} model={model} controls={controls} editing={Boolean(format)} canCompose={!format || canCompose} materials={materials} contents={contents} deleteAction={deleteAction}
      componentOptions={componentOptions} componentRows={components} onComponentRowsChange={setComponents}
      onSubmit={event => { if (!valid) { event.preventDefault(); return; } void form.submit(event); }}
      messages={<CommandFormMessage error={form.error} />}
      footer={<Button type="submit" form={formId} disabled={form.submitting || !valid}>{form.submitting ? "Saving…" : format ? "Save format" : "Create format"}</Button>}
    />
  </CommandForm>;
}
