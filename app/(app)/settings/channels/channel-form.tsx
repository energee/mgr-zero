// app/(app)/settings/channels/channel-form.tsx — CommandForm (bottom sheet on
// phone, dialog on desk) over upsert_sale_channel. Doubles as create (no
// `channel` prop, titled Add channel) and edit (`channel` pre-fills name +
// treatment, the title names the saved channel, and the input carries `id`).
"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ChannelView } from "@/components/mgr/views/channel";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toChannelViewProps } from "@/lib/mgr/channel-view";

export type SaleChannelEditData = { id: string; name: string; taxTreatment: string };

export function ChannelForm({ channel }: { channel?: SaleChannelEditData }) {
  const isEdit = !!channel;
  const [name, setName] = useState(channel?.name ?? "");
  const [taxTreatment, setTaxTreatment] = useState<string>(channel?.taxTreatment ?? "taxable");
  const [open, setOpenState] = useState(false);
  const action = useCommandAction();
  const nameError = action.error && action.failure?.code === "duplicate_channel_name" ? action.error : null;

  function setOpen(next: boolean) {
    setOpenState(next);
    setName(channel?.name ?? "");
    setTaxTreatment(channel?.taxTreatment ?? "taxable");
    action.setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (action.busy || !name.trim()) return;
    await action.run("upsert_sale_channel", {
      ...(isEdit ? { id: channel.id } : {}), name: name.trim(), taxTreatment,
    }, () => setOpen(false), { target: channel?.id });
  }

  return (
    <CommandForm
      open={open}
      onOpenChange={setOpen}
      title={isEdit ? `Edit channel · ${channel.name}` : "Add channel"}
      trigger={
        <Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"} aria-label={isEdit ? `Edit ${channel.name}` : undefined}>
          {isEdit ? "Edit" : "Add channel"}
        </Button>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <ChannelView
          model={toChannelViewProps({ id: channel?.id ?? "", name, tax_treatment: taxTreatment })}
          nameError={nameError}
          submitting={action.busy}
          controls={{
            name: value => { setName(value); action.setError(null); },
            taxTreatment: setTaxTreatment,
          }}
          messages={<CommandFormMessage error={nameError ? null : action.error} />}
          footer={save => <CommandFormFooter>{save}</CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
