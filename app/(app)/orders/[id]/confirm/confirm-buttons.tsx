// app/(app)/orders/[id]/confirm/confirm-buttons.tsx — the live half of the
// Confirm order review. Each line's quantity is the shared number field, and
// the stock and ATP judgments follow the edited quantities. While a quantity
// differs from the order, the verbs are a required Reason and Save lines
// (adjust_order_lines, which leaves a submitted order unallocated), or Discard
// changes; otherwise they are confirm_order and cancel_order. A clean confirm
// goes back to Orders; one that returns ATP warnings stays to show them
// (atp-warnings.tsx) until "Back to Orders" — it skips the post-confirm
// refresh, which would re-render page.tsx and redirect the now-confirmed order
// away before the warnings are read. Cancel order is the shared
// cancel-order-dialog.tsx.
"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ConfirmOrderView } from "@/components/mgr/views/confirm-order";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toConfirmOrderViewProps, type ConfirmOrderSnapshot } from "@/lib/mgr/confirm-order-view";
import { AtpWarnings, atpWarnings, type AtpWarning } from "../atp-warnings";
import { CancelOrderDialog } from "../cancel-order-dialog";

const ordered = (snapshot: ConfirmOrderSnapshot) => Object.fromEntries(snapshot.lines.map((l) => [l.id, String(Number(l.qty_ordered))]));

/** page.tsx keys this on the saved quantities, so a save remounts it with fresh state. */
export function ConfirmOrderForm({ snapshot }: { snapshot: ConfirmOrderSnapshot }) {
  const router = useRouter();
  const action = useCommandAction();
  const orderId = snapshot.order.id;
  const [qtys, setQtys] = useState(() => ordered(snapshot));
  const [reason, setReason] = useState("");
  const [warnings, setWarnings] = useState<AtpWarning[] | null>(null);
  const changed = snapshot.lines.some((l) => qtys[l.id] !== String(Number(l.qty_ordered)));
  const model = toConfirmOrderViewProps({ ...snapshot, lines: snapshot.lines.map((l) => ({ ...l, qty_ordered: Number(qtys[l.id]) })) });
  let footer: ReactNode;
  if (warnings) footer = (
    <div className="flex flex-col gap-2">
      <AtpWarnings warnings={warnings} skuNames={new Map(snapshot.lines.map((l) => [l.sku_id, l.skus?.name ?? l.sku_id]))} />
      <div className="grid grid-cols-1 gap-2 md:flex md:justify-end">
        <Button onClick={() => { router.push("/orders"); router.refresh(); }}>Back to Orders</Button>
      </div>
    </div>
  );
  else if (changed) footer = (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={action.error} />
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Button type="submit" disabled={action.busy}>{action.busy ? "Saving…" : "Save lines"}</Button>
        <Button type="button" variant="outline" disabled={action.busy} onClick={() => { setQtys(ordered(snapshot)); setReason(""); }}>Discard changes</Button>
      </div>
    </div>
  );
  else footer = (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={action.error} />
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Button type="button" disabled={action.busy} onClick={() => void action.run("confirm_order", { orderId }, (data) => {
          const next = atpWarnings(data);
          if (next.length > 0) return setWarnings(next);
          router.push("/orders");
          router.refresh();
        }, { refresh: false })}>{action.busy ? "Confirming…" : "Confirm order"}</Button>
        <CancelOrderDialog orderId={orderId} action={action} trigger={<Button variant="destructive" disabled={action.busy}>Cancel order</Button>} onCancelled={() => router.push("/orders")} />
      </div>
    </div>
  );
  // The form submits only Save lines; Reason is required while it shows.
  return <form className="contents" onSubmit={(event) => {
    event.preventDefault();
    // A blank quantity is sent and refused, never dropped: adjust_order_lines
    // replaces every line, so dropping it would remove the SKU (#433).
    if (changed && !action.busy) void action.run("adjust_order_lines", { orderId, reason, lines: snapshot.lines.map((l) => ({ skuId: l.sku_id, qty: Number(qtys[l.id]) })) });
  }}>
    <ConfirmOrderView model={model} quantities={qtys} onQuantity={warnings ? undefined : (key, value) => setQtys((prev) => ({ ...prev, [key]: value }))}
      reason={reason} onReason={changed && !warnings ? setReason : undefined} footer={footer} />
  </form>;
}
