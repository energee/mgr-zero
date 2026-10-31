// Live transfer adapter: existing authorized commands bind the shared document.
"use client";

import type { BinMoveStock } from "@/lib/commands/inventory";
import { TransferDetailView } from "@/components/mgr/views/transfer-detail";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { TransferDetailViewModel, TransferReceiveLine, TransferSourceLine } from "@/lib/mgr/transfer-detail-view";

type Line = { id: string; skuId: string | null; materialId: string | null; fromBinId: string; qty: number; qtyPicked: number | null };

export function TransferActions({ model, transferId, status, lines, stock }: { model: TransferDetailViewModel; stock: BinMoveStock[]; transferId: string; status: string; lines: Line[] }) {
  const { busy, error, run } = useCommandAction();
  const sourceLines: TransferSourceLine[] = lines.filter(line => line.skuId || line.materialId).map(line => ({
    id: line.id,
    qty: line.qtyPicked ?? line.qty,
    step: line.skuId ? 0.01 : 0.0001,
    sources: stock.filter(source => source.bin_id === line.fromBinId && (
      (source.kind === "sku" && source.stock_id === line.skuId) || (source.kind === "material" && source.stock_id === line.materialId)
    )).map(source => ({ lotId: source.lot_id, name: source.name, lotCode: source.lot_code, qty: source.qty })),
  }));

  async function receive(receivedSources: TransferReceiveLine[]) {
    if (status === "submitted" && !await run("record_stock_transfer_pick", { transferId, picks: lines.map(line => ({ lineId: line.id, qty: line.qty })) })) return;
    const sourcesByLine = new Map(receivedSources.map(line => [line.lineId, line.sources]));
    await run("receive_stock_transfer", {
      transferId,
      lines: lines.map(line => ({
        lineId: line.id,
        qty: line.qtyPicked ?? line.qty,
        ...(line.skuId || line.materialId ? { sources: sourcesByLine.get(line.id) ?? [] } : {}),
      })),
    });
  }

  return <TransferDetailView model={{ ...model, sources: sourceLines }} actions={{
    busy,
    error,
    onReceive: receivedSources => void receive(receivedSources),
    onCancel: reason => run("cancel_stock_transfer", { transferId, reason }),
  }} />;
}
