// app/(app)/orders/[id]/confirm/confirm-buttons.tsx — the live half of the
// Confirm order review. Each line's quantity is the shared number field, and
// the stock and ATP judgments follow the edited quantities. While a quantity
// differs from the order, the verbs are a required Reason and Save lines
// (adjust_order_lines, which leaves a submitted order unallocated), or Discard
// changes; otherwise they are confirm_order and cancel_order. A clean confirm
// lands on the order; one that returns ATP warnings stays to show them
// (atp-warnings.tsx) under "Order confirmed.", with the quantities read-only,
// until "Back to Orders" — it skips the post-confirm
// refresh, which would re-render page.tsx and redirect the now-confirmed order
// away before the warnings are read. Cancel order is the shared
// cancel-order-dialog.tsx.
"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmOrderView } from "@/components/mgr/views/confirm-order";
import { toConfirmOrderViewProps, type ConfirmOrderSnapshot } from "@/lib/mgr/confirm-order-view";
import { AtpWarnings, atpWarnings, type AtpWarning } from "../atp-warnings";
import { CancelOrderDialog } from "../cancel-order-dialog";
import { SaveLinesActions, useLineQuantities } from "../order-lines-form";

/** page.tsx keys this on the saved quantities, so a save remounts it with fresh state. */
export function ConfirmOrderForm({ snapshot }: { snapshot: ConfirmOrderSnapshot }) {
  const router = useRouter();
  const orderId = snapshot.order.id;
  const edit = useLineQuantities(orderId, snapshot.lines);
  const { action, qtys, changed } = edit;
  const [warnings, setWarnings] = useState<AtpWarning[] | null>(null);
  const model = toConfirmOrderViewProps({ ...snapshot, lines: snapshot.lines.map((l) => ({ ...l, qty_ordered: Number(qtys[l.id]) })) });
  let footer: ReactNode;
  if (warnings) footer = (
    <div className="flex flex-col gap-2">
      <AtpWarnings warnings={warnings} skuNames={new Map(snapshot.lines.map((l) => [l.sku_id, l.skus?.name ?? l.sku_id]))} saved="Order confirmed." />
      <div className="grid grid-cols-1 gap-2 md:flex md:justify-end">
        <Button onClick={() => { router.push("/orders"); router.refresh(); }}>Back to Orders</Button>
      </div>
    </div>
  );
  else if (changed) footer = <div className="flex flex-col gap-2"><SaveLinesActions edit={edit} /></div>;
  else footer = (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={action.error} />
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Button type="button" disabled={action.busy} onClick={() => void action.run("confirm_order", { orderId }, (data) => {
          const next = atpWarnings(data);
          if (next.length > 0) return setWarnings(next);
          // A clean confirm lands on the order, whose next step is Pick (#1503).
          router.push(`/orders/${orderId}`);
          router.refresh();
        }, { refresh: false })}>{action.busy ? "Confirming…" : "Confirm order"}</Button>
        <CancelOrderDialog orderId={orderId} action={action} trigger={<Button variant="destructive" disabled={action.busy}>Cancel order</Button>} onCancelled={() => router.push("/orders")} />
      </div>
    </div>
  );
  // The form submits only Save lines; Reason is required while it shows.
  return <form className="contents" onSubmit={edit.onSubmit}>
    <ConfirmOrderView model={model} readOnly={Boolean(warnings)} quantities={qtys} onQuantity={warnings ? undefined : edit.setQty}
      reason={edit.reason} onReason={changed && !warnings ? edit.setReason : undefined} footer={footer} />
  </form>;
}
