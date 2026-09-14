"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { FormatView } from "@/components/mgr/views/format";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { FormatRowsForm } from "./formats/[id]/rows-form";
import { validFormatRows } from "@/lib/format-edit-rules";
import { formatCommandInput, formatControls, formatSizing, toFormatViewProps, type FormatSnapshot, type FormatViewModel } from "@/lib/mgr/format-view";

export function FormatForm({ format, materials, contents, canCompose = false, componentOptions = [] }: { format?: FormatSnapshot["format"]; materials?: ReactNode; contents?: ReactNode; canCompose?: boolean; componentOptions?: { id: string; name: string }[] } = {}) {
  const router = useRouter();
  const formId = useId();
  const initial = toFormatViewProps({ format: format ? { ...format, composed: format.composed || canCompose } : { id: "new", name: "", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: null } });
  const [model, setModel] = useState(initial);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<FormatSnapshot["format"]>();
  const [components, setComponents] = useState([{ id: "", qty: "1" }]);
  const action = useCommandAction();
  const patch = (next: Partial<FormatViewModel>) => setModel(previous => ({ ...previous, ...next }));
  const sizing = formatSizing(model);
  const valid = sizing.valid && (!model.composed || Boolean(format) || validFormatRows(components, componentOptions.map(option => option.id), false));
  function close() {
    setOpen(false);
    setModel(initial);
    setComponents([{ id: "", qty: "1" }]);
    action.setError(null);
    if (created) router.push(`/catalog/formats/${created.id}`);
    setCreated(undefined);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!valid || action.busy) return;
    await action.run("upsert_format", formatCommandInput(model, format), data => {
      const saved = data as FormatSnapshot["format"];
      if (!format && model.composed) { setCreated(saved); return; }
      close();
      if (!format) router.push(`/catalog/formats/${saved.id}`);
    });
  }
  const controls = formatControls(model, patch);
  return <CommandForm open={open} onOpenChange={next => { if (!action.busy) { if (next) setOpen(true); else close(); } }} title={created ? "Save package contents" : format ? "Edit format" : "New format"} trigger={<Button variant="outline">{format ? "Edit format" : "New Format"}</Button>}>
    <FormatView formId={formId} model={model} controls={controls} editing={Boolean(format)} canCompose={!format || canCompose} materials={materials}
      contentsOnly={Boolean(created)} componentOptions={componentOptions} componentRows={components} onComponentRowsChange={setComponents}
      contents={created ? <FormatRowsForm formatId={created.id} kind="components" initial={components} options={componentOptions} embedded onSaved={close} /> : contents}
      onSubmit={submit}
      messages={<CommandFormMessage error={action.error} />}
      footer={<CommandFormFooter><Button type="submit" form={formId} disabled={action.busy || !valid}>{action.busy ? "Saving…" : format ? "Save format" : model.composed ? "Create format and continue" : "Create format"}</Button></CommandFormFooter>}
    />
  </CommandForm>;
}
