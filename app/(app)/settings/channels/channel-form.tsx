// app/(app)/settings/channels/channel-form.tsx — CommandForm (bottom sheet on
// phone, dialog on desk) over upsert_sale_channel. Doubles as create (no
// `channel` prop) and edit (`channel` pre-fills name + treatment and the input
// carries `id`).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ChannelView } from "@/components/mgr/views/channel";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toChannelViewProps } from "@/lib/mgr/channel-view";
import { TAX_TREATMENTS, treatmentLabel } from "./tax-treatments";

export type SaleChannelEditData = { id: string; name: string; taxTreatment: string };

export function ChannelForm({ channel }: { channel?: SaleChannelEditData }) {
  const isEdit = !!channel;
  const [name, setName] = useState(channel?.name ?? "");
  const [taxTreatment, setTaxTreatment] = useState<string>(channel?.taxTreatment ?? "taxable");
  const form = useCommandForm("upsert_sale_channel", {
    build: () => ({ ...(isEdit ? { id: channel.id } : {}), name, taxTreatment }),
    reset: () => { setName(channel?.name ?? ""); setTaxTreatment(channel?.taxTreatment ?? "taxable"); },
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title="Channel"
      trigger={
        <Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Add channel"}
        </Button>
      }
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <ChannelView
          model={toChannelViewProps({ id: channel?.id ?? "", name, tax_treatment: taxTreatment })}
          controls={{
            name: setName,
            taxTreatment: (label) => setTaxTreatment(TAX_TREATMENTS.find((value) => treatmentLabel(value) === label) ?? "taxable"),
          }}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Saving…" : "Save channel"}
            </Button>
          </CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
