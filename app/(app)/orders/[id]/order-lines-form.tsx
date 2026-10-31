// app/(app)/orders/[id]/order-lines-form.tsx — the Order page with its lines
// changed in place (#1503). Ordered is the shared number field, ✕ removes a
// line, and Add line appends one that picks its SKU. Once anything differs from
// the order, a required Reason, Save lines (adjust_order_lines with every kept
// and added line) and Discard changes appear under the lines. A save remounts
// OrderLinesEditor (keyed on the saved lines) with fresh state, while
// OrderLinesForm keeps that save's ATP warnings under the lines, after
// "Lines saved." (#1088). useLineQuantities and SaveLinesActions are shared
// with Confirm order (confirm/confirm-buttons.tsx), which edits quantities only.
"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { OrderView } from "@/components/mgr/views/order";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { AtpWarnings, atpWarnings, type AtpWarning } from "./atp-warnings";

type Line = { id: string; sku_id: string; qty_ordered: number };
type AddedLine = { key: string; skuId: string };

const saved = (lines: Line[]) => Object.fromEntries(lines.map((l) => [l.id, String(Number(l.qty_ordered))]));

/** The edited quantities, added and removed lines, and Reason; onSubmit sends
 *  adjust_order_lines with every kept and added line, then calls onSaved with its result. */
export function useLineQuantities(orderId: string, lines: Line[], onSaved?: (data: unknown) => void) {
  const action = useCommandAction();
  const [qtys, setQtys] = useState(() => saved(lines));
  const [reason, setReason] = useState("");
  const [added, setAdded] = useState<AddedLine[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const kept = lines.filter((l) => !removed.includes(l.id));
  const changed = added.length > 0 || removed.length > 0 || kept.some((l) => qtys[l.id] !== String(Number(l.qty_ordered)));
  return {
    action, qtys, reason, setReason, changed, added, removed,
    setQty: (key: string, value: string) => setQtys((prev) => ({ ...prev, [key]: value })),
    addLine: () => setAdded((prev) => [...prev, { key: crypto.randomUUID(), skuId: "" }]),
    setSku: (key: string, skuId: string) => setAdded((prev) => prev.map((l) => (l.key === key ? { ...l, skuId } : l))),
    removeLine: (key: string) => {
      if (added.some((l) => l.key === key)) setAdded((prev) => prev.filter((l) => l.key !== key));
      else setRemoved((prev) => [...prev, key]);
    },
    discard: () => { setQtys(saved(lines)); setReason(""); setAdded([]); setRemoved([]); },
    onSubmit: (event: FormEvent<HTMLFormElement>) => {
      // A dialog form inside the page (Cancel order) bubbles its submit here
      // through the React tree; only this form's own submit saves lines.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!changed || action.busy) return;
      const trimmedReason = reason.trim();
      if (!trimmedReason) { action.setError("Reason required"); return; }
      if (added.some((l) => !l.skuId)) { action.setError("Choose a SKU for each added line, or remove it."); return; }
      // A blank quantity is sent and refused, never dropped: adjust_order_lines
      // replaces every line, so dropping it would remove the SKU (#433).
      void action.run("adjust_order_lines", { orderId, reason: trimmedReason, lines: [
        ...kept.map((l) => ({ skuId: l.sku_id, qty: Number(qtys[l.id]) })),
        ...added.map((l) => ({ skuId: l.skuId, qty: Number(qtys[l.key]) })),
      ] }, onSaved);
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

type ViewProps = Omit<ComponentProps<typeof OrderView>, "quantities" | "onQuantity" | "reason" | "onReason" | "lineActions" | "lineEdit">;
type FormProps = {
  orderId: string;
  lines: Line[];
  /** False for a role or status adjust_order_lines refuses: the page then reads as before. */
  editable: boolean;
  /** list_skus as picker options, for an added line and the warnings' names. */
  skus: { id: string; label: string }[];
} & ViewProps;

/** One edit of the saved lines; OrderLinesForm remounts it after each save. */
export function OrderLinesEditor({ orderId, lines, editable, skus, warnings, onSaved, model, pickup, ...view }: FormProps & {
  /** The last save's ATP warnings, shown under the lines until the next change. */
  warnings: AtpWarning[];
  onSaved: (data: unknown) => void;
}) {
  const edit = useLineQuantities(orderId, lines, onSaved);
  const pickupAction = useCommandAction();
  // Held here and flipped on success: busy clears before the save's refresh
  // lands, and a click in that window must send the new value, not the old prop.
  const [pickupOn, setPickupOn] = useState(pickup?.value ?? false);
  const router = useRouter();
  const reorder = useCommandAction();
  const shown = { ...model, lines: model.lines.filter((l) => !edit.removed.includes(l.key)) };
  const lineActions = edit.changed ? <SaveLinesActions edit={edit} />
    : warnings.length > 0 ? <AtpWarnings warnings={warnings} skuNames={new Map(skus.map((sku) => [sku.id, sku.label]))} saved="Lines saved." />
    : undefined;
  return <form className="contents" onSubmit={edit.onSubmit}>
    <OrderView {...view} model={shown} quantities={edit.qtys} onQuantity={editable ? edit.setQty : undefined}
      pickup={pickup ? { value: pickupOn, busy: pickupAction.busy, error: pickupAction.error,
        onChange: (value) => { void pickupAction.run("set_order_pickup", { orderId, pickup: value }, () => setPickupOn(value)); } } : undefined}
      reordering={reorder.busy} onReorderRefused={() => void reorder.run("reorder_refused_delivery", { orderId }, data => {
        const result = z.object({ order_id: z.string().uuid() }).parse(data);
        router.push(`/orders/${result.order_id}/edit`);
      })}
      lineEdit={editable ? { skus, added: edit.added, onAdd: edit.addLine, onSku: edit.setSku, onRemove: edit.removeLine } : undefined}
      reason={edit.reason} onReason={edit.changed ? edit.setReason : undefined} lineActions={lineActions} />
    <CommandFormMessage error={reorder.error} />
  </form>;
}

/** Holds the last save's ATP warnings across the remount a save causes, so they show on the refreshed order. */
export function OrderLinesForm(props: FormProps) {
  const [warnings, setWarnings] = useState<AtpWarning[]>([]);
  return <OrderLinesEditor key={props.lines.map((l) => `${l.id}:${l.qty_ordered}`).join()} {...props}
    warnings={warnings} onSaved={(data) => setWarnings(atpWarnings(data))} />;
}
