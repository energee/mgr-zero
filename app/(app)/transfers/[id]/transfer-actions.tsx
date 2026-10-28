// app/(app)/transfers/[id]/transfer-actions.tsx — the one next verb for a
// stock transfer: Receive, and Cancel transfer with a reason until it is
// received (#578). Each line receives its picked qty, taken from the lot
// quantities typed under it, prefilled when the line has one source. A
// submitted transfer skips the pick step: picked equals ordered, so Receive
// records that pick first, then receives (#1507).
"use client";

import { useState } from "react";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { transferSourceQty } from "@/lib/mgr/transfer-detail-view";

type Line = { id: string; skuId: string | null; materialId: string | null; fromBinId: string; qty: number; qtyPicked: number | null };

export function TransferActions({ transferId, status, lines, stock }: { stock: BinMoveStock[]; transferId: string; status: string; lines: Line[] }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const sources = (l: Line) => stock.filter(s => s.bin_id === l.fromBinId && ((s.kind === "sku" && s.stock_id === l.skuId) || (s.kind === "material" && s.stock_id === l.materialId)));
  const key = (line: string, lot: string | null) => `${line}:${lot ?? ""}`;
  const qtyOf = (l: Line, s: BinMoveStock) => transferSourceQty(quantities[key(l.id, s.lot_id)], sources(l).length, l.qtyPicked ?? l.qty);
  const { busy, error, run } = useCommandAction();
  const receivable = status === "submitted" || status === "picked" || status === "in_transit";
  async function receive() {
    if (status === "submitted" && !await run("record_stock_transfer_pick", { transferId, picks: lines.map((l) => ({ lineId: l.id, qty: l.qty })) })) return;
    await run("receive_stock_transfer", { transferId, lines: lines.map((l) => ({ lineId: l.id, qty: l.qtyPicked ?? l.qty, ...(l.skuId || l.materialId ? { sources: sources(l).filter(s => Number(qtyOf(l, s)) > 0).map(s => ({ lotId: s.lot_id, qty: Number(qtyOf(l, s)) })) } : {}) })) });
  }
  const irreversible = "w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit";
  return (
    <div className="flex flex-col gap-2">
      {receivable && <>{lines.filter(l => l.skuId || l.materialId).map(l => <div key={l.id} className="flex flex-col gap-2 border-b pb-3"><p>Choose sources totaling {l.qtyPicked ?? l.qty} units</p>{sources(l).map(s => <div key={key(l.id, s.lot_id)}>{E.edit(`${s.name} · ${s.lot_code ?? "Untracked / legacy stock"} · ${s.qty} available`, qtyOf(l, s), "number", undefined, { min: 0, step: l.skuId ? 0.01 : 0.0001, onChange: qty => setQuantities(prev => ({ ...prev, [key(l.id,s.lot_id)]: qty })) })}</div>)}</div>)}</>}
      {receivable && (
        <Button data-variant="irreversible" className={irreversible} disabled={busy} onClick={() => void receive()}>Receive</Button>
      )}
      <CommandForm open={cancelOpen} onOpenChange={(next) => { setCancelOpen(next); if (!next) setReason(""); }} title="Cancel transfer" trigger={<Button variant="ghost" className="w-full md:w-fit" disabled={busy}>Cancel transfer</Button>}>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void run("cancel_stock_transfer", { transferId, reason }, () => setCancelOpen(false)); }}>
          {E.edit("Reason", reason, "text", undefined, { required: true, maxLength: 500, onChange: setReason })}
          <p className="text-sm text-muted-foreground">Nothing has left the source bin, so no stock moves.</p>
          <CommandFormMessage error={error} />
          <CommandFormFooter><Button type="submit" variant="destructive" disabled={busy}>Cancel transfer</Button></CommandFormFooter>
        </form>
      </CommandForm>
      {!cancelOpen && <CommandFormMessage error={error} />}
    </div>
  );
}
