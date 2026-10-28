// app/(app)/orders/[id]/lifecycle-buttons.tsx — status-gated order actions,
// drawn into OrderView's slots: LifecycleButtons fills the header (Submit for
// a draft, which then opens Review and confirm (#1503); Ship or Complete transfer once picked; Record pick
// while confirmed or picked), primary first, and makes its fulfillment
// verbs secondary while Put back leads; CancelOrderAction fills the bottom
// row with the quiet Cancel order (any pre-ship status, via
// cancel-order-dialog.tsx). OrderActionScope wraps the page so both share one
// command action: Submit and Cancel see the same busy and error state.
// There is no Confirm here: a submitted order confirms only through Review and
// confirm (/orders/[id]/confirm), so stock and source warnings show before
// commit (#713). Lines change, add and remove in place on the order
// (order-lines-form.tsx). Record pick and Ship / Complete transfer are
// links to their own pages under /orders/[id]/. Calls commands directly rather
// than through useCommandForm since these aren't single-field command forms.
"use client";

import { createContext, use, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { CancelOrderButton, OrderCancelRow } from "@/components/mgr/views/order";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { OrderStatus } from "@/lib/mgr/order-status";
import { CancelOrderDialog } from "./cancel-order-dialog";

const OrderAction = createContext<ReturnType<typeof useCommandAction> | null>(null);

/** One command action for the order page, shared by LifecycleButtons and CancelOrderAction. */
export function OrderActionScope({ children }: { children: ReactNode }) {
  return <OrderAction value={useCommandAction()}>{children}</OrderAction>;
}

function useOrderAction() {
  const action = use(OrderAction);
  if (!action) throw new Error("Order actions must render inside OrderActionScope");
  return action;
}

export function LifecycleButtons({
  orderId,
  status,
  transfer = false,
  restockFirst = false,
  canSell,
  canFulfill,
}: {
  transfer?: boolean;
  /** Put back leads the header (staged beer on an open order), so fulfillment verbs are secondary. */
  restockFirst?: boolean;
  canSell: boolean;
  canFulfill: boolean;
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const action = useOrderAction();
  const { busy, error } = action;
  const open = status === "confirmed" || status === "picked";
  const fulfil = restockFirst ? "g" : "p";

  return (
    <>
      {canSell && status === "draft" && E.btn("Submit", busy ? "p disabled" : "p", undefined, () => void action.run("submit_order", { orderId }, () => router.push(`/orders/${orderId}/confirm`)))}
      {canFulfill && status === "picked" && E.btn(transfer ? "Complete transfer" : "Ship", fulfil, `/orders/${orderId}/${transfer ? "complete" : "ship"}`)}
      {canFulfill && open && E.btn("Record pick", status === "confirmed" ? fulfil : "g", `/orders/${orderId}/pick`)}
      {error ? <div className="basis-full"><CommandFormMessage error={error} /></div> : null}
    </>
  );
}

/** Cancel order with its required reason, for Admin and Sales before the order ships; nothing otherwise. */
export function CancelOrderAction({ orderId, status, canSell }: { orderId: string; status: OrderStatus; canSell: boolean }) {
  const router = useRouter();
  const action = useOrderAction();
  if (!canSell || status === "shipped" || status === "cancelled") return null;
  return (
    <OrderCancelRow>
      <CancelOrderDialog orderId={orderId} action={action} trigger={<CancelOrderButton disabled={action.busy} />} onCancelled={() => router.refresh()} />
    </OrderCancelRow>
  );
}
