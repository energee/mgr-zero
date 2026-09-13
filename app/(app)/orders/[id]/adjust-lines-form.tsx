"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { AdjustLinesView } from "@/components/mgr/views/adjust-lines";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { docNo } from "@/lib/mgr/doc-no";

type LineRow = { skuId: string; qty: string };
export function AdjustLinesForm({ orderId, orderNo, currentLines, skus }: {
  orderId: string; orderNo?: number | null;
  currentLines: { skuId: string; qty: number; qtyPicked?: number | null }[];
  skus: { id: string; label: string }[];
}) {
  const initialLines = () => currentLines.map(l => ({ skuId: l.skuId, qty: String(l.qty) }));
  const [lines, setLines] = useState<LineRow[]>(initialLines);
  const [reason, setReason] = useState("");
  const form = useCommandForm("adjust_order_lines", {
    build: () => ({ orderId, reason, lines: lines.filter(l => l.skuId && l.qty).map(l => ({ skuId: l.skuId, qty: Number(l.qty) })) }),
    reset: () => { setLines(initialLines()); setReason(""); },
  });
  function updateLine(index: number, patch: Partial<LineRow>) {
    setLines(prev => prev.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Adjust lines" trigger={<Button size="sm" variant="outline">Adjust lines</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-2">
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
        submitting={form.submitting} messages={<CommandFormMessage error={form.error} />} />
    </form>
  </CommandForm>;
}
