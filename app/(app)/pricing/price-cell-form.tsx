// Inline price editing. Blank edits restore the saved amount; only the
// explicit Clear confirmation removes a price. Feedback survives refreshes.
"use client";

import { useRef, useState } from "react";
import { PriceCellClear, PriceCellInput } from "@/components/mgr/views/price-groups";
import { cellCommit } from "@/lib/mgr/price-groups-view";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { dollarsInput } from "@/lib/mgr/money";

export function PriceCellForm({
  saleChannelId, priceGroupId, formatId, value, groupName, formatName, channelName,
}: {
  saleChannelId: string; priceGroupId: string; formatId: string; value: string | null;
  groupName: string; formatName: string; channelName: string;
}) {
  const initial = value ?? "";
  const [source, setSource] = useState(initial);
  const [persisted, setPersisted] = useState(initial);
  const [dollars, setDollars] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const sending = useRef(false);
  // Accept refreshed prices without dropping a newer draft or the Saved message.
  if (source !== initial) {
    setSource(initial);
    setPersisted(initial);
    if (dollars === persisted) setDollars(initial);
  }
  // One grid page holds many cells: an unresolved save locks only this cell.
  const cell = `${saleChannelId}:${priceGroupId}:${formatId}`;
  const action = useCommandAction(cell);
  const ids = { saleChannelId, priceGroupId, formatId };
  const pending = cellCommit(persisted, dollars);

  async function save(command: string, input: unknown, nextValue: string) {
    if (sending.current || action.busy || action.blocked) return false;
    sending.current = true;
    setStatus("Saving…");
    try {
      const saved = await action.run(command, input, () => {
        setPersisted(nextValue);
        setDollars(nextValue);
        setStatus("Saved");
      });
      if (!saved) setStatus(null);
      return saved;
    } finally {
      sending.current = false;
    }
  }

  const commit = async () => {
    if (sending.current || action.busy || action.blocked) return;
    if (pending.kind === "invalid") {
      setStatus(null);
      action.setError("Enter a non-negative price with at most two decimal places, like 12.50. Exponents are not accepted.");
    } else if (pending.kind === "clear") {
      setDollars(persisted);
      action.setError(null);
      setStatus("Price unchanged. Use Clear and confirm to remove it.");
    } else if (pending.kind === "save") {
      await save("set_channel_price", { ...ids, unitPriceCents: pending.cents }, dollarsInput(pending.cents));
    }
  };

  return (
    <PriceCellInput label={`${groupName} · ${formatName} on ${channelName}`} value={dollars}
      onChange={text => { setDollars(text); setStatus(null); action.setError(null); }} onCommit={commit}
      disabled={action.busy || action.blocked} error={action.error} status={status}>
      {persisted !== "" && (
        <PriceCellClear groupName={groupName} formatName={formatName} channelName={channelName}
          busy={action.busy} reason={action.blocked && !action.busy ? "Resolve the saved request before clearing this price." : null} error={action.error}
          onDelete={() => save("clear_channel_price", ids, "")} />
      )}
    </PriceCellInput>
  );
}
