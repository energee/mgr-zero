// app/(app)/transfers/[id]/page.tsx — one stock transfer: header, lines with
// from/to bins, and the next verb (transfer-actions.tsx): Submit, Record pick,
// Receive. Receiving posts the paired ledger rows; the page then shows what
// moved. Same movements as Complete transfer, no invoice.
import type { BinMoveStock } from "@/lib/commands/inventory";
import { TransferDetailView } from "@/components/mgr/views/transfer-detail";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toTransferDetailViewProps } from "@/lib/mgr/transfer-detail-view";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { TransferActions } from "./transfer-actions";

type Detail = {
  transfer: { id: string; from_location_id: string; transfer_no: number | null; status: string; note: string | null; received_at: string | null; from_location: { name: string } | null; to_location: { name: string } | null };
  lines: { id: string; sku_id: string | null; material_id: string | null; qty: number; qty_picked: number | null; from_bin_id: string; to_bin_id: string; keg_size: string | null; skus: { name: string } | null; materials: { name: string } | null; keg_pools: { name: string } | null }[];
  bins: { id: string; name: string }[];
};

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { transfer, lines, bins } = await orNotFound(runCommand("get_stock_transfer", { transferId: id }, ctx) as Promise<Detail>);
  const stock = brewery.role === "admin" || brewery.role === "warehouse" ? await runCommand("get_bin_move_stock", { locationId: transfer.from_location_id }, ctx) as BinMoveStock[] : [];
  const binById = new Map(bins.map((b) => [b.id, b.name]));
  const bin = (id: string) => binById.get(id) ?? "—";
  const what = (l: Detail["lines"][number]) => l.skus?.name ?? l.materials?.name ?? (l.keg_pools ? `${l.keg_pools.name} · ${l.keg_size?.replace("_", " ")}` : "Line");
  const done = transfer.status === "received";
  return (
    <TransferDetailView
      model={toTransferDetailViewProps({
        transfer: {
          id: transfer.id,
          transfer_no: transfer.transfer_no,
          status: transfer.status,
          note: transfer.note,
          from_name: transfer.from_location?.name ?? "—",
          to_name: transfer.to_location?.name ?? "—",
        },
        lines: lines.map((l) => ({
          id: l.id,
          name: what(l),
          from_bin: bin(l.from_bin_id),
          to_bin: bin(l.to_bin_id),
          qty: Number(l.qty),
          qty_picked: l.qty_picked === null ? null : Number(l.qty_picked),
        })),
      })}
      footer={done ? undefined : (
        <TransferActions stock={stock} transferId={transfer.id} status={transfer.status} lines={lines.map((l) => ({ id: l.id, skuId: l.sku_id, materialId: l.material_id, fromBinId: l.from_bin_id, qty: Number(l.qty), qtyPicked: l.qty_picked === null ? null : Number(l.qty_picked) }))} />
      )}
    />
  );
}
