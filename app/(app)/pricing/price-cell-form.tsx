// app/(app)/pricing/price-cell-form.tsx — one cell of the price grid, edited in
// place: the price every SKU on this price group and format sells at on this
// sale channel. Dollars in, integer cents out; Enter or leaving the cell saves
// (set_channel_price) through cellCommit. Emptying a priced cell saves nothing
// and offers Clear instead, which confirms before clear_channel_price leaves
// those SKUs unpriced on that channel. The page keys this cell on its value,
// so a save or clear remounts it fresh.
"use client";

import { useState } from "react";
import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { PriceCellInput } from "@/components/mgr/views/price-groups";
import { cellCommit } from "@/lib/mgr/price-groups-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function PriceCellForm({
  saleChannelId, priceGroupId, formatId, value, groupName, formatName, channelName,
}: {
  saleChannelId: string; priceGroupId: string; formatId: string; value: string | null;
  groupName: string; formatName: string; channelName: string;
}) {
  const initial = value ?? "";
  const [dollars, setDollars] = useState(initial);
  // One grid page holds many cells: an unresolved save locks only this cell.
  const cell = `${saleChannelId}:${priceGroupId}:${formatId}`;
  const action = useCommandAction(cell);
  const ids = { saleChannelId, priceGroupId, formatId };
  const pending = cellCommit(initial, dollars);

  const commit = () => {
    if (action.busy) return;
    if (pending.kind === "invalid") action.setError("Enter dollars, like 12.50");
    else if (pending.kind === "save") void action.run("set_channel_price", { ...ids, unitPriceCents: pending.cents });
    else action.setError(null);
  };

  return (
    <PriceCellInput label={`${groupName} · ${formatName} on ${channelName}`} value={dollars} onChange={setDollars} onCommit={commit}
      disabled={action.busy || action.blocked} error={action.error}>
      {pending.kind === "clear" && (
        <ConfirmDeleteControl title="Clear price" triggerLabel="Clear" size="sm" busy={action.busy} error={action.error} busyLabel="Clearing…"
          name={<>Clear the {groupName} · {formatName} price on <strong>{channelName}</strong>?</>}
          warning="Every SKU of a brand on this group becomes unpriced in this format on this channel and cannot sell there until a price is saved again."
          onDelete={() => action.run("clear_channel_price", ids)} />
      )}
    </PriceCellInput>
  );
}
