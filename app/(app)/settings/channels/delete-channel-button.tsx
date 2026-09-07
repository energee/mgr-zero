// app/(app)/settings/channels/delete-channel-button.tsx — delete_sale_channel.
// The refusals are product copy, not stack traces: "channel is in use" (a
// movement or price group references it) and the Wholesale message both come
// back as CommandError text and render inline beside the row.
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
