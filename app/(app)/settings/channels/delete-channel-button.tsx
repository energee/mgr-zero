// app/(app)/settings/channels/delete-channel-button.tsx — delete_sale_channel,
// after the shared confirm sheet (#760). The refusal is product copy, not a
// stack trace: "channel is in use" (a movement, customer, order or price cell
// references it) comes back as CommandError text and renders in the sheet.
"use client";

import { ConfirmDeleteControl } from "@/components/mgr/views/confirm-delete";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeleteChannelButton({ channelId, name }: { channelId: string; name: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <ConfirmDeleteControl title={`Delete ${name}`} triggerLabel="Delete" size="sm" busy={busy} error={error}
      name={<>Delete the <strong>{name}</strong> sale channel? This cannot be undone.</>}
      warning="A channel a movement, customer, order or price cell uses cannot be deleted."
      onDelete={() => run("delete_sale_channel", { channelId }, undefined, { target: channelId })} />
  );
}
