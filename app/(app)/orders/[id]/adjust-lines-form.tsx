// app/(app)/orders/[id]/adjust-lines-form.tsx — the live half of Adjust lines
// (/orders/[id]/adjust): holds the edited lines and the required reason for the
// change, draws them with the shared AdjustLinesView (saved lines as brand and
// format rows, sorted by brand; an added line picks its SKU), and sends
// adjust_order_lines; success returns to the
// order, unless a SKU on it is still below zero ATP: then the page says the
// lines saved, shows those warnings (atp-warnings.tsx), and offers only
// "Back to order" in place of Save lines, so the saved change isn't resent (#1088).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { AdjustLinesView } from "@/components/mgr/views/adjust-lines";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { docNo } from "@/lib/mgr/doc-no";
import { adjustLineView, type AdjustLinesSavedLine } from "@/lib/mgr/adjust-lines-view";
import { byBrand } from "@/lib/mgr/brand-lines";
import { AtpWarnings, atpWarnings, type AtpWarning } from "./atp-warnings";

type LineRow = { skuId: string; qty: string; added?: boolean };
export function AdjustLinesForm({ orderId, orderNo, currentLines, skus }: {
  orderId: string; orderNo?: number | null;
  currentLines: AdjustLinesSavedLine[];
  skus: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineRow[]>(() => byBrand(currentLines).map(l => ({ skuId: l.sku_id, qty: String(Number(l.qty_ordered)) })));
  const [reason, setReason] = useState("");
  const [warnings, setWarnings] = useState<AtpWarning[]>([]);
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
      data => {
        const next = atpWarnings(data);
        if (next.length > 0) setWarnings(next);
        else router.push(`/orders/${orderId}`);
      });
  }}>
    <AdjustLinesView model={{
      backTo: docNo("ORD", orderNo ?? null, "Order"), backHref: `/orders/${orderId}`, title: "Adjust lines", skus,
      lines: lines.map((line, index) => {
        const saved = line.added ? undefined : currentLines.find(current => current.sku_id === line.skuId);
        return saved ? adjustLineView(saved, String(index), line.qty) : { key: String(index), added: true, skuId: line.skuId, name: "", detail: "", qty: line.qty };
      }),
    }} reason={reason} onReason={setReason} onQuantity={(index, qty) => updateLine(index, { qty })}
      onSku={(index, skuId) => updateLine(index, { skuId })}
      onAdd={() => setLines(prev => [...prev, { skuId: "", qty: "", added: true }])}
      onRemove={index => setLines(prev => prev.filter((_, i) => i !== index))}
      submitting={busy} messages={<>
        <CommandFormMessage error={error} />
        <AtpWarnings warnings={warnings} skuNames={new Map(skus.map(sku => [sku.id, sku.label]))} saved="Lines saved." />
      </>}
      footer={warnings.length > 0
        ? <Button type="button" className="w-full md:w-fit md:self-end" onClick={() => router.push(`/orders/${orderId}`)}>Back to order</Button>
        : undefined} />
  </form>;
}
