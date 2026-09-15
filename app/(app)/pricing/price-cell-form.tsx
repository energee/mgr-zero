// app/(app)/pricing/price-cell-form.tsx — one cell of the price grid: the price
// every SKU on this price group and format sells at on this sale channel. The
// dialog is titled with the group and format and names the channel in its
// body, so the cell being edited is never in doubt. Dollars in, integer cents
// out (set_channel_price); Clear empties the cell (clear_channel_price), which
// leaves those SKUs unpriced on that channel.
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dollarsInput } from "@/lib/mgr/money";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";

export function PriceCellForm({
  saleChannelId, priceGroupId, formatId, cents, label, groupName, formatName, channelName,
}: {
  saleChannelId: string; priceGroupId: string; formatId: string; cents: number | null; label: ReactNode;
  groupName: string; formatName: string; channelName: string;
}) {
  const initial = dollarsInput(cents);
  // The page keys this form on `cents`, so a save or clear remounts it fresh.
  const [dollars, setDollars] = useState(initial);
  const clear = useCommandAction();
  const form = useCommandForm("set_channel_price", {
    build: () => ({ saleChannelId, priceGroupId, formatId, unitPriceCents: Math.round(Number(dollars) * 100) }),
    reset: () => setDollars(initial),
  });

  return (
    <CommandForm
      open={form.open}
      onOpenChange={form.setOpen}
      title={`${groupName} · ${formatName}`}
      trigger={<Button variant="ghost" size="sm" className="tabular-nums">{label}</Button>}
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cell-price">Price on {channelName} (USD)</Label>
          <Input id="cell-price" type="number" step="0.01" min="0" value={dollars} onChange={(e) => setDollars(e.target.value)} required />
        </div>
        <p className="text-sm text-muted-foreground">
          Every SKU of a brand on group {groupName} sells at this price as {formatName} on {channelName}. An empty cell is unpriced: that package cannot sell on this channel.
        </p>
        <CommandFormMessage error={form.error} />
        <CommandFormMessage error={clear.error} />
        <CommandFormFooter>
          {cents !== null && (
            <Button
              type="button"
              variant="ghost"
              disabled={clear.busy}
              onClick={() => clear.run("clear_channel_price", { saleChannelId, priceGroupId, formatId })}
            >
              Clear
            </Button>
          )}
          <Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save price"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
