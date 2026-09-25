// app/(app)/settings/channels/delete-channel-button.tsx — delete_sale_channel.
// The refusal is product copy, not a stack trace: "channel is in use" (a
// movement, customer, order or price cell references it) comes back as
// CommandError text and renders inline beside the row.
"use client";

import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeleteChannelButton({ channelId }: { channelId: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => run("delete_sale_channel", { channelId })}>Delete</Button>
      <CommandFormMessage error={error} />
    </>
  );
}
