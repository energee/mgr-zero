// app/(app)/orders/[id]/lifecycle-buttons.tsx — status-gated order actions,
// drawn into OrderView's slots: LifecycleButtons fills the header (Submit for
// a draft; Ship or Complete transfer once picked; Record pick and Adjust
// lines while confirmed or picked), primary first; CancelOrderAction fills the bottom row with the
// quiet Cancel order (any pre-ship status, via cancel-order-dialog.tsx).
// There is no Confirm here: a submitted order confirms only through Review and
// confirm (/orders/[id]/confirm), so stock and source warnings show before
// commit (#713). Adjust lines, Record pick and Ship / Complete transfer are
// links to their own pages under /orders/[id]/. Calls commands directly rather
// than through useCommandForm since these aren't single-field command forms.
"use client";

import { useRouter } from "next/navigation";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { CancelOrderButton, OrderCancelRow } from "@/components/mgr/views/order";
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
  const action = useCommandAction();
  const { busy, error } = action;
  const open = status === "confirmed" || status === "picked";

  return (
    <>
      {canSell && status === "draft" && E.btn("Submit", busy ? "p disabled" : "p", undefined, () => void action.run("submit_order", { orderId }))}
      {canFulfill && status === "picked" && E.btn(transfer ? "Complete transfer" : "Ship", "p", `/orders/${orderId}/${transfer ? "complete" : "ship"}`)}
      {canFulfill && open && E.btn("Record pick", status === "confirmed" ? "p" : "g", `/orders/${orderId}/pick`)}
      {canSell && open && E.btn("Adjust lines", "g", `/orders/${orderId}/adjust`)}
      {error ? <div className="basis-full"><CommandFormMessage error={error} /></div> : null}
    </>
  );
}

/** Cancel order with its required reason, for Admin and Sales before the order ships; nothing otherwise. */
export function CancelOrderAction({ orderId, status, canSell }: { orderId: string; status: OrderStatus; canSell: boolean }) {
  const router = useRouter();
  const action = useCommandAction();
  if (!canSell || status === "shipped" || status === "cancelled") return null;
  return (
    <OrderCancelRow>
      <CancelOrderDialog orderId={orderId} action={action} trigger={<CancelOrderButton disabled={action.busy} />} onCancelled={() => router.refresh()} />
    </OrderCancelRow>
  );
}
