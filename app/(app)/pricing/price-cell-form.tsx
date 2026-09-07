// app/(app)/pricing/price-cell-form.tsx — one cell of the price grid: the price
// every SKU on this price group and format sells at on this sale channel.
// Dollars in, integer cents out (set_channel_price); Clear empties the cell
// (clear_channel_price), which leaves those SKUs unpriced on that channel.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction, useCommandForm } from "@/lib/commands/use-command-form";

export function PriceCellForm({
  saleChannelId, priceGroupId, formatId, cents, label,
}: {
  saleChannelId: string; priceGroupId: string; formatId: string; cents: number | null; label: string;
}) {
  const initial = cents === null ? "" : (cents / 100).toFixed(2);
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
      title="Price"
      trigger={<Button variant="ghost" size="sm">{label}</Button>}
    >
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cell-price">Price (USD)</Label>
          <Input id="cell-price" type="number" step="0.01" min="0" value={dollars} onChange={(e) => setDollars(e.target.value)} required />
        </div>
        <p className="text-sm text-muted-foreground">
          Every SKU of a brand on this price group sells at this price, in this format, on this sale channel.
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
