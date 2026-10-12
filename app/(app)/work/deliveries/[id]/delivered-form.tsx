// Live command adapter for the shared delivery/refusal and leave-for-later controls.
"use client";

import { DeliveryOutcomeForm } from "@/components/mgr/views/confirm-delivery";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCommandContext } from "@/lib/brewery-provider";
import { readRecoveries, RECOVERY_CHANGED } from "@/lib/commands/recovery";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function DeliveredForm({ routeId, deliveryId, lines, transfer }: { routeId: string; deliveryId: string; lines: { key: string; title: string; qty: string }[]; transfer: boolean }) {
  const router = useRouter();
  const { busy, error, failure, run } = useCommandAction();
  const context = useCommandContext();
  const hasPending = useCallback(() => {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return readRecoveries(sessionStorage, context).some(attempt =>
        ["confirm_delivery", "leave_delivery_for_later"].includes(attempt.name)
        && (attempt.input as { deliveryId?: string } | null)?.deliveryId === deliveryId);
    } catch {
      // Unreadable saved state cannot prove either competing action is safe.
      return true;
    }
  }, [context, deliveryId]);
  const [pending, setPending] = useState(hasPending);
  useEffect(() => {
    let wasPending = hasPending();
    const refresh = () => {
      const nextPending = hasPending();
      // Shared recovery acknowledges this stop's retry/discard; reload stale form/failure state.
      if (wasPending && !nextPending) location.reload();
      wasPending = nextPending;
      setPending(nextPending);
    };
    refresh(); window.addEventListener(RECOVERY_CHANGED, refresh);
    return () => window.removeEventListener(RECOVERY_CHANGED, refresh);
  }, [hasPending]);
  const blocked = pending || failure?.kind === "unknown";
  return <DeliveryOutcomeForm lines={lines} transfer={transfer} busy={busy} blocked={blocked} error={error}
    onSubmit={(input) => { if (busy || blocked || hasPending()) return; void run("confirm_delivery", { deliveryId, ...input }); }}
    onLeave={() => { if (busy || blocked || hasPending()) return; void run("leave_delivery_for_later", { routeId, deliveryId }, () => router.push(`/routes/${routeId}`), { refresh: false }); }} />;
}
