// app/(app)/pricing/price-list-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the
// upsert_price_list command. Doubles as create (no `priceList` prop) and edit
// (`priceList` prop pre-fills the name and channel, and the command input
// carries `id`, per plan decision 8). Every list prices for exactly one sale
// channel: the picker preselects the list's channel on edit, Wholesale on create.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type PriceListChannel = { id: string; name: string };
export type PriceListEditData = { id: string; name: string; channelId: string };

// Create defaults to Wholesale when the brewery still has it, else the first channel.
function defaultChannel(channels: PriceListChannel[]) {
  return (channels.find((c) => c.name === "Wholesale") ?? channels[0])?.id ?? "";
}

export function PriceListForm({ priceList, channels }: { priceList?: PriceListEditData; channels: PriceListChannel[] }) {
  const isEdit = !!priceList;
  const initialChannel = priceList?.channelId ?? defaultChannel(channels);
  const [name, setName] = useState(priceList?.name ?? "");
  const [channelId, setChannelId] = useState(initialChannel);
  const form = useCommandForm("upsert_price_list", {
    build: () => ({ ...(isEdit ? { id: priceList.id } : {}), name, channelId }),
    reset: () => { setName(priceList?.name ?? ""); setChannelId(initialChannel); },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={isEdit ? "Edit Price Group" : "New Price Group"} trigger={<Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "New Price Group"}
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-list-name">Name</Label>
            <Input id="price-list-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-list-channel">Sale channel</Label>
            <NativeSelect id="price-list-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </div>
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
