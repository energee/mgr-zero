// app/(app)/orders/[id]/adjust-lines-form.tsx — the live half of Adjust lines
// (/orders/[id]/adjust): holds the edited lines and the required reason for the
// change, draws them with the
// shared AdjustLinesView, and sends adjust_order_lines; success returns to the order.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { AdjustLinesView } from "@/components/mgr/views/adjust-lines";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { docNo } from "@/lib/mgr/doc-no";

type LineRow = { skuId: string; qty: string };
export function AdjustLinesForm({ orderId, orderNo, currentLines, skus }: {
  orderId: string; orderNo?: number | null;
  currentLines: { skuId: string; qty: number; qtyPicked?: number | null }[];
  skus: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineRow[]>(() => currentLines.map(l => ({ skuId: l.skuId, qty: String(l.qty) })));
  const [reason, setReason] = useState("");
  const { busy, error, run } = useCommandAction();
  function updateLine(index: number, patch: Partial<LineRow>) {
    setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    // A blank quantity is sent and refused, never dropped: adjust_order_lines
    // replaces every line, so dropping it removed the SKU from the order (#433).
    void run("adjust_order_lines", { orderId, reason, lines: lines.filter(l => l.skuId).map(l => ({ skuId: l.skuId, qty: Number(l.qty) })) },
      () => router.push(`/orders/${orderId}`));
  }}>
    <AdjustLinesView model={{
      backTo: docNo("ORD", orderNo ?? null, "Order"), backHref: `/orders/${orderId}`, title: "Adjust lines", skus,
      lines: lines.map((line, index) => {
        const picked = currentLines.find(current => current.skuId === line.skuId)?.qtyPicked;
        const belowPicked = picked != null && Number(line.qty) < picked;
        return { key: String(index), skuId: line.skuId, name: skus.find(sku => sku.id === line.skuId)?.label ?? line.skuId, qty: line.qty, detail: belowPicked ? `picked ${picked}` : "", tone: belowPicked ? "w" : "" };
      }),
    }} reason={reason} onReason={setReason} onQuantity={(index, qty) => updateLine(index, { qty })}
      onSku={(index, skuId) => updateLine(index, { skuId })}
      onAdd={() => setLines(prev => [...prev, { skuId: "", qty: "" }])}
      onRemove={index => setLines(prev => prev.filter((_, i) => i !== index))}
      submitting={busy} messages={<CommandFormMessage error={error} />} />
  </form>;
}
