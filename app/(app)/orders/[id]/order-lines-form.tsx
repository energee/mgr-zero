// app/(app)/orders/[id]/order-lines-form.tsx — the Order page with quantities
// adjusted in place. Ordered is the shared number field; once a quantity
// differs from the order, a required Reason, Save lines (adjust_order_lines
// with every line) and Discard changes appear under the lines. page.tsx keys
// this on the saved quantities, so a save remounts it with fresh state. Adding
// or removing a line stays on /orders/[id]/adjust. useLineQuantities and
// SaveLinesActions are shared with Confirm order (confirm/confirm-buttons.tsx).
"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { OrderView } from "@/components/mgr/views/order";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Line = { id: string; sku_id: string; qty_ordered: number };

const saved = (lines: Line[]) => Object.fromEntries(lines.map((l) => [l.id, String(Number(l.qty_ordered))]));

/** The edited quantities and Reason; onSubmit sends adjust_order_lines with every line. */
export function useLineQuantities(orderId: string, lines: Line[]) {
  const action = useCommandAction();
  const [qtys, setQtys] = useState(() => saved(lines));
  const [reason, setReason] = useState("");
  const changed = lines.some((l) => qtys[l.id] !== String(Number(l.qty_ordered)));
  return {
    action, qtys, reason, setReason, changed,
    setQty: (key: string, value: string) => setQtys((prev) => ({ ...prev, [key]: value })),
    discard: () => { setQtys(saved(lines)); setReason(""); },
    onSubmit: (event: FormEvent<HTMLFormElement>) => {
      // A dialog form inside the page (Cancel order) bubbles its submit here
      // through the React tree; only this form's own submit saves lines.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      // A blank quantity is sent and refused, never dropped: adjust_order_lines
      // replaces every line, so dropping it would remove the SKU (#433).
      if (changed && !action.busy) void action.run("adjust_order_lines", { orderId, reason, lines: lines.map((l) => ({ skuId: l.sku_id, qty: Number(qtys[l.id]) })) });
    },
  };
}

/** The save error, then Save lines (the form's submit) and Discard changes. */
export function SaveLinesActions({ edit }: { edit: ReturnType<typeof useLineQuantities> }) {
  return <>
    <CommandFormMessage error={edit.action.error} />
    <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
      <Button type="submit" disabled={edit.action.busy}>{edit.action.busy ? "Saving…" : "Save lines"}</Button>
      <Button type="button" variant="outline" disabled={edit.action.busy} onClick={edit.discard}>Discard changes</Button>
    </div>
  </>;
}

/** `editable` is false for a role or status adjust_order_lines refuses: the page then reads as before. */
export function OrderLinesForm({ orderId, lines, editable, ...view }: { orderId: string; lines: Line[]; editable: boolean } & Omit<ComponentProps<typeof OrderView>, "quantities" | "onQuantity" | "reason" | "onReason" | "lineActions">) {
  const edit = useLineQuantities(orderId, lines);
  return <form className="contents" onSubmit={edit.onSubmit}>
    <OrderView {...view} quantities={edit.qtys} onQuantity={editable ? edit.setQty : undefined}
      reason={edit.reason} onReason={edit.changed ? edit.setReason : undefined}
      lineActions={<SaveLinesActions edit={edit} />} />
  </form>;
}
