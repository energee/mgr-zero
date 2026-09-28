"use client";

import { DeliveryOutcomeForm } from "@/components/mgr/views/confirm-delivery";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeliveredForm({ deliveryId, lines, transfer }: { deliveryId: string; lines: { key: string; title: string; qty: string }[]; transfer: boolean }) {
  const { busy, error, run } = useCommandAction();
  return <DeliveryOutcomeForm lines={lines} transfer={transfer} busy={busy} error={error}
    onSubmit={(input) => { void run("confirm_delivery", { deliveryId, ...input }); }} />;
}
