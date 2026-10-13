// Live command adapter for the shared delivery/refusal and leave-for-later controls.
"use client";

import { DeliveryOutcomeForm } from "@/components/mgr/views/confirm-delivery";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCommandContext } from "@/lib/brewery-provider";
import { hasRecoveryForTarget, RECOVERY_CHANGED } from "@/lib/commands/recovery";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Props = { routeId: string; deliveryId: string; lines: { key: string; title: string; qty: string }[]; transfer: boolean };

/**
 * Both verbs save their request under the stop's id (`target`), so an
 * unresolved request locks this stop's two actions and no other stop. When the
 * shared recovery panel retries or discards it, the actions remount with fresh
 * form and failure state and the server data refreshes.
 */
export function DeliveredForm(props: Props) {
  const router = useRouter();
  const context = useCommandContext();
  const hasPending = useCallback(() => {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return hasRecoveryForTarget(sessionStorage, context, props.deliveryId);
    } catch {
      // Unreadable saved state cannot prove either competing action is safe.
      return true;
    }
  }, [context, props.deliveryId]);
  const [pending, setPending] = useState(hasPending);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const refresh = () => {
      const next = hasPending();
      if (pending && !next) { setGeneration(n => n + 1); router.refresh(); }
      setPending(next);
    };
    window.addEventListener(RECOVERY_CHANGED, refresh);
    return () => window.removeEventListener(RECOVERY_CHANGED, refresh);
  }, [hasPending, pending, router]);
  return <DeliveryActions key={generation} {...props} pending={pending} hasPending={hasPending} />;
}

function DeliveryActions({ routeId, deliveryId, lines, transfer, pending, hasPending }: Props & { pending: boolean; hasPending: () => boolean }) {
  const router = useRouter();
  const { busy, error, failure, run } = useCommandAction();
  const target = deliveryId;
  // The fieldset gates busy/blocked; this rechecks storage for a click that lands before the re-render.
  return <DeliveryOutcomeForm lines={lines} transfer={transfer} busy={busy} blocked={pending || failure?.kind === "unknown"} error={error}
    onSubmit={(input) => { if (hasPending()) return; void run("confirm_delivery", { deliveryId, ...input }, undefined, { target }); }}
    onLeave={() => { if (hasPending()) return; void run("leave_delivery_for_later", { routeId, deliveryId }, () => router.push(`/routes/${routeId}`), { target, refresh: false }); }} />;
}
