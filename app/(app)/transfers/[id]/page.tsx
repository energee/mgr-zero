// Transfer detail reads authorized data and binds its shared document/actions.
import { cache } from "react";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toTransferDetailViewProps } from "@/lib/mgr/transfer-detail-view";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { TransferActions } from "./transfer-actions";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getTransferPageData(id);
  return { title: navTitle("/transfers") };
}

type Detail = {
  transfer: { id: string; from_location_id: string; transfer_no: number | null; status: string; note: string | null; cancel_reason: string | null; received_at: string | null; from_location: { name: string } | null; to_location: { name: string } | null };
  lines: { id: string; sku_id: string | null; material_id: string | null; qty: number; qty_picked: number | null; from_bin_id: string; to_bin_id: string; keg_size: string | null; skus: { name: string } | null; materials: { name: string; base_uom: string } | null; keg_pools: { name: string } | null }[];
  bins: { id: string; name: string }[];
};

const getTransferPageData = cache(async function getTransferPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const data = await orNotFound(runCommand("get_stock_transfer", { transferId: id }, ctx) as Promise<Detail>);
  return { brewery, ctx, data };
});

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, data } = await getTransferPageData(id);
  const { transfer, lines, bins } = data;
  const stock = brewery.roles.includes("admin") || brewery.roles.includes("warehouse") ? await runCommand("get_bin_move_stock", { locationId: transfer.from_location_id }, ctx) as BinMoveStock[] : [];
  const binById = new Map(bins.map((b) => [b.id, b.name]));
  const bin = (id: string) => binById.get(id) ?? "—";
  const what = (line: Detail["lines"][number]) => {
    if (line.skus) return { name: line.skus.name, unit: "units" };
    if (line.materials) return { name: line.materials.name, unit: line.materials.base_uom };
    return { name: line.keg_pools ? `${line.keg_pools.name} · ${line.keg_size?.replace("_", " ")}` : "Line", unit: "kegs" };
  };
  return (
    <TransferActions
      model={toTransferDetailViewProps({
        transfer: {
          id: transfer.id,
          transfer_no: transfer.transfer_no,
          status: transfer.status,
          note: transfer.note,
          cancel_reason: transfer.cancel_reason,
          from_name: transfer.from_location?.name ?? "—",
          to_name: transfer.to_location?.name ?? "—",
        },
        lines: lines.map((l) => ({
          id: l.id,
          ...what(l),
          from_bin: bin(l.from_bin_id),
          to_bin: bin(l.to_bin_id),
          qty: Number(l.qty),
          qty_picked: l.qty_picked === null ? null : Number(l.qty_picked),
        })),
      })}
      stock={stock}
      transferId={transfer.id}
      status={transfer.status}
      lines={lines.map((line) => ({
        id: line.id,
        skuId: line.sku_id,
        materialId: line.material_id,
        fromBinId: line.from_bin_id,
        qty: Number(line.qty),
        qtyPicked: line.qty_picked === null ? null : Number(line.qty_picked),
      }))}
    />
  );
}
