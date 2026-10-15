// app/(app)/orders/[id]/lifecycle-buttons.tsx — status-gated order actions:
// Submit (draft) and Cancel with reason (any pre-ship status, via
// cancel-order-dialog.tsx) run here. There is no Confirm here: a submitted
// order confirms only through Review and confirm (/orders/[id]/confirm), so
// stock and source warnings show before commit (#713). Adjust lines, Record pick and
// Ship / Complete transfer are links to their own pages under /orders/[id]/. Calls commands directly rather
// than through useCommandForm since these aren't single-field command forms.
"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { OrderStatus } from "@/lib/mgr/order-status";
import { CancelOrderDialog } from "./cancel-order-dialog";

export function LifecycleButtons({
  orderId,
  status,
  transfer = false,
  canSell,
  canFulfill,
}: {
  transfer?: boolean;
  canSell: boolean;
  canFulfill: boolean;
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const action = useCommandAction();
  const { busy, error } = action;
  const canCancel = canSell && status !== "shipped" && status !== "cancelled";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {canSell && status === "draft" && (
          <Button size="sm" disabled={busy} onClick={() => void action.run("submit_order", { orderId })}>
            Submit
          </Button>
        )}
        {canSell && (status === "confirmed" || status === "picked") && (
          <Button size="sm" variant="outline" asChild><Link href={`/orders/${orderId}/adjust`}>Adjust lines</Link></Button>
        )}
        {canFulfill && (status === "confirmed" || status === "picked") && (
          <Button size="sm" asChild><Link href={`/orders/${orderId}/pick`}>Record pick</Link></Button>
        )}
        {canFulfill && status === "picked" && <Button size="sm" asChild><Link href={`/orders/${orderId}/${transfer ? "complete" : "ship"}`}>{transfer ? "Complete transfer" : "Ship"}</Link></Button>}
        {canCancel && (
          <CancelOrderDialog orderId={orderId} action={action} trigger={<Button size="sm" variant="destructive" disabled={busy}>Cancel</Button>} onCancelled={() => router.refresh()} />
        )}
      </div>
      <CommandFormMessage error={error} />
    </div>
  );
}
