// app/(app)/orders/[id]/cancel-order-dialog.tsx — the one Cancel order dialog
// shared by the order detail (lifecycle-buttons.tsx) and the Confirm order
// review (confirm/confirm-buttons.tsx): a required reason, cancel_order's error
// inside the dialog, a busy label, and a reset of reason and error on close (the error also on open).
"use client";

import { CancelOrderControl } from "@/components/mgr/views/cancel-order";
import type { useCommandAction } from "@/lib/commands/use-command-form";

export function CancelOrderDialog({ orderId, action, trigger, onCancelled }: {
  orderId: string;
  /** The caller's command action, so its other buttons share busy and error. */
  action: ReturnType<typeof useCommandAction>;
  trigger: React.ReactNode;
  onCancelled: () => void;
}) {
  return <CancelOrderControl trigger={trigger} busy={action.busy} error={action.error} onOpenChange={() => action.setError(null)}
    onCancel={reason => action.run("cancel_order", { orderId, reason }, onCancelled)} />;
}
