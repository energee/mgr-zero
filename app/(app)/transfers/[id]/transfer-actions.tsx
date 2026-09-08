// app/(app)/transfers/[id]/transfer-actions.tsx — the one next verb for a
// stock transfer by status: Submit (draft), Record pick (submitted; picks
// default to the ordered qty), Receive (picked; quantities default to picked).
"use client";

import { useState } from "react";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Line = { id: string; skuId: string | null; materialId: string | null; fromBinId: string; qty: number; qtyPicked: number | null };

export function TransferActions({ transferId, status, lines, stock }: { stock: BinMoveStock[]; transferId: string; status: string; lines: Line[] }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const sources = (l: Line) => stock.filter(s => s.bin_id === l.fromBinId && ((s.kind === "sku" && s.stock_id === l.skuId) || (s.kind === "material" && s.stock_id === l.materialId)));
  const key = (line: string, lot: string | null) => `${line}:${lot ?? ""}`;
  const { busy, error, run } = useCommandAction();
  const irreversible = "w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit";
  return (
    <div className="flex flex-col gap-2">
      {status === "draft" && <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("submit_stock_transfer", { transferId })}>Submit</Button>}
      {status === "submitted" && <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("record_stock_transfer_pick", { transferId, picks: lines.map((l) => ({ lineId: l.id, qty: l.qty })) })}>Record pick</Button>}
      {(status === "picked" || status === "in_transit") && <>{lines.filter(l => l.skuId || l.materialId).map(l => <div key={l.id} className="flex flex-col gap-2 border-b pb-3"><p>Choose sources totaling {l.qtyPicked ?? l.qty} units</p>{sources(l).map(s => <Label key={key(l.id, s.lot_id)} className="flex flex-col gap-2">{s.name} · {s.lot_code ?? "Untracked / legacy stock"} · {s.qty} available<Input type="number" min="0" step={l.skuId ? "0.01" : "0.0001"} value={quantities[key(l.id,s.lot_id)] ?? ""} onChange={e => setQuantities(prev => ({ ...prev, [key(l.id,s.lot_id)]: e.target.value }))} /></Label>)}</div>)}</>}
      {(status === "picked" || status === "in_transit") && (
        <Button data-variant="irreversible" className={irreversible} disabled={busy} onClick={() => run("receive_stock_transfer", { transferId, lines: lines.map((l) => ({ lineId: l.id, qty: l.qtyPicked ?? l.qty, ...(l.skuId || l.materialId ? { sources: sources(l).filter(s => Number(quantities[key(l.id,s.lot_id)]) > 0).map(s => ({ lotId: s.lot_id, qty: Number(quantities[key(l.id,s.lot_id)]) })) } : {}) })) })}>Receive</Button>
      )}
      <CommandFormMessage error={error} />
    </div>
  );
}
