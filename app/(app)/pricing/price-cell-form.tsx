// app/(app)/pricing/price-cell-form.tsx — one cell of the price grid: the price
// every SKU on this price group and format sells at on this sale channel. The
// dialog is titled with the group and format and names the channel in its
// body, so the cell being edited is never in doubt. Dollars in, integer cents
// out (set_channel_price); Clear, once confirmed, empties the cell
// (clear_channel_price), which leaves those SKUs unpriced on that channel. The
// trigger's sr-only text names the cell, since its visible text is the price.
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { dollarsInput, toCents } from "@/lib/mgr/money";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function PriceCellForm({
  saleChannelId, priceGroupId, formatId, cents, label, groupName, formatName, channelName,
}: {
  saleChannelId: string; priceGroupId: string; formatId: string; cents: number | null; label: ReactNode;
  groupName: string; formatName: string; channelName: string;
}) {
  const initial = dollarsInput(cents);
  // The page keys this form on `cents`, so a save or clear remounts it fresh.
  const [dollars, setDollars] = useState(initial);
  // One grid page holds many cells: an unresolved save locks only this cell.
  const cell = `${saleChannelId}:${priceGroupId}:${formatId}`;
  const form = useCommandForm("set_channel_price", {
    build: () => ({ saleChannelId, priceGroupId, formatId, unitPriceCents: toCents(dollars) }),
    reset: () => setDollars(initial),
    target: cell,
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title={`${groupName} · ${formatName}`}
      trigger={<Button variant="ghost" size="sm" className="tabular-nums">{label}<span className="sr-only"> · {groupName} · {formatName} on {channelName}</span></Button>}
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {E.edit(`Price on ${channelName} (USD)`, dollars, "number", undefined, { id: "cell-price", min: 0, step: 0.01, onChange: setDollars, required: true })}
        <p className="text-sm text-muted-foreground">
          Every SKU of a brand on group {groupName} sells at this price as {formatName} on {channelName}. An empty cell is unpriced: that package cannot sell on this channel.
        </p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          {cents !== null && (
            <ConfirmDeleteControl title="Clear price" triggerLabel="Clear" busy={form.busy} error={form.error} busyLabel="Clearing…"
              name={<>Clear the {groupName} · {formatName} price on <strong>{channelName}</strong>?</>}
              warning="Every SKU of a brand on this group becomes unpriced in this format on this channel and cannot sell there until a price is saved again."
              onDelete={() => form.run("clear_channel_price", { saleChannelId, priceGroupId, formatId }, undefined, { target: cell })} />
          )}
          <Button type="submit" disabled={form.busy}>{form.submitting ? "Saving…" : "Save price"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
