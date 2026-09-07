// app/(app)/settings/channels/channel-form.tsx — CommandForm (bottom sheet on
// phone, dialog on desk) over upsert_sale_channel. Doubles as create (no
// `channel` prop) and edit (`channel` pre-fills name + treatment and the input
// carries `id`).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
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
      title={isEdit ? "Edit Channel" : "New Channel"}
      trigger={
        <Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Add channel"}
        </Button>
      }
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel-name">Channel name</Label>
          <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel-treatment">Tax treatment</Label>
          <Select value={taxTreatment} onValueChange={setTaxTreatment} required>
            <SelectTrigger id="channel-treatment"><SelectValue /></SelectTrigger>
            <SelectContent>{TAX_TREATMENTS.map((t) => <SelectItem key={t} value={t}>{treatmentLabel(t)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          Customers may override this. Sales without a customer take the channel default.
        </p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting}>
            {form.submitting ? "Saving…" : "Save channel"}
          </Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
