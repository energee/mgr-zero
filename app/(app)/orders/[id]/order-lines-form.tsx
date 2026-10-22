// app/(app)/orders/[id]/order-lines-form.tsx — the Order page with quantities
// adjusted in place. Ordered is the shared number field; once a quantity
// differs from the order, a required Reason, Save lines (adjust_order_lines
// with every line) and Discard changes appear under the lines. page.tsx keys
// this on the saved quantities, so a save remounts it with fresh state. Adding
// or removing a line stays on /orders/[id]/adjust.
"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { OrderView } from "@/components/mgr/views/order";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Line = { id: string; sku_id: string; qty_ordered: number };

/** `editable` is false for a role or status adjust_order_lines refuses: the page then reads as before. */
export function OrderLinesForm({ orderId, lines, editable, ...view }: { orderId: string; lines: Line[]; editable: boolean } & Omit<ComponentProps<typeof OrderView>, "quantities" | "onQuantity" | "reason" | "onReason" | "lineActions">) {
  const ordered = () => Object.fromEntries(lines.map((l) => [l.id, String(Number(l.qty_ordered))] as const));
  const [qtys, setQtys] = useState(ordered);
  const [reason, setReason] = useState("");
  const action = useCommandAction();
  const changed = lines.some((l) => qtys[l.id] !== String(Number(l.qty_ordered)));
  return <form className="contents" onSubmit={(event) => {
    // A dialog form inside the header verbs (Cancel order) bubbles its submit
    // here through the React tree; only this form's own submit saves lines.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    // A blank quantity is sent and refused, never dropped: adjust_order_lines
    // replaces every line, so dropping it would remove the SKU (#433).
    if (changed && !action.busy) void action.run("adjust_order_lines", { orderId, reason, lines: lines.map((l) => ({ skuId: l.sku_id, qty: Number(qtys[l.id]) })) });
  }}>
    <OrderView {...view} quantities={qtys} onQuantity={editable ? (key, value) => setQtys((prev) => ({ ...prev, [key]: value })) : undefined}
      reason={reason} onReason={changed ? setReason : undefined}
      lineActions={<>
        <CommandFormMessage error={action.error} />
        <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
          <Button type="submit" disabled={action.busy}>{action.busy ? "Saving…" : "Save lines"}</Button>
          <Button type="button" variant="outline" disabled={action.busy} onClick={() => { setQtys(ordered()); setReason(""); }}>Discard changes</Button>
        </div>
      </>} />
  </form>;
}
