"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ShipSources } from "@/lib/commands/orders";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ShipView } from "@/components/mgr/views/ship";
import { ShipmentDoneView } from "@/components/mgr/views/shipment-done";
import { CompleteTransferView } from "@/components/mgr/views/complete-transfer";
import { ShipmentSourcesView, type ShipmentAllocations } from "@/components/mgr/views/shipment-sources";
import { toShipViewProps, type ShipSnapshot } from "@/lib/mgr/ship-view";
import { toShipmentDoneViewProps, type ShipmentDoneViewModel } from "@/lib/mgr/shipment-done-view";
import { toCompleteTransferViewProps } from "@/lib/mgr/complete-transfer-view";

export type ShipLine = { id: string; skuId: string; skuName: string; qtyPicked: number | null };
export type ShippingSnapshot = ShipSnapshot & { order: ShipSnapshot["order"] & { kind: string; to_location_id: string | null } };

export function buildShipLines(lines: ShippingSnapshot["lines"], qtys: Record<string, string>, allocations: ShipmentAllocations, available: ShipSources) {
  return lines.map(line => ({
    lineId: line.id, qty: Number(qtys[line.id]),
    sources: Number(qtys[line.id]) === 0 ? [] : (allocations[line.id] ?? []).map(row => {
      const source = available.stock.find(stock => `${stock.bin_id}:${stock.lot_id ?? ""}` === row.key && stock.stock_id === line.sku_id);
      return { binId: source?.bin_id, lotId: source?.lot_id ?? null, qty: Number(row.qty), toBinId: row.toBinId || undefined };
    }),
  }));
}

export function ShipForm({ snapshot, available }: { snapshot: ShippingSnapshot; available: ShipSources }) {
  const router = useRouter();
  const transfer = snapshot.order.kind === "taproom_transfer";
  const { busy, error, run } = useCommandAction();
  const [allocations, setAllocations] = useState<ShipmentAllocations>({});
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(snapshot.lines.map(line => [line.id, String(line.qty_picked ?? 0)])));
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [invoiceTiming, setInvoiceTiming] = useState<"now" | "on_delivery">("now");
  const [result, setResult] = useState<ShipmentDoneViewModel | null>(null);
  const proposed = { ...snapshot, invoiceTiming, lines: snapshot.lines.map(line => ({ ...line, qty_shipped: Number(qtys[line.id]) })) };
  const sources = <ShipmentSourcesView lines={snapshot.lines.map(line => ({
    key: line.id, name: line.skus?.name ?? "Line", qty: Number(qtys[line.id]),
    options: available.stock.filter(stock => stock.stock_id === line.sku_id).map(stock => ({
      key: `${stock.bin_id}:${stock.lot_id ?? ""}`,
      label: `${available.bins.find(bin => bin.id === stock.bin_id)?.name ?? stock.bin_id} · ${stock.lot_code ?? "Untracked / legacy stock"} · ${stock.qty} available`,
    })),
  }))} allocations={allocations} onChange={setAllocations} destinationBins={available.destinationBins} disabled={busy} />;
  const disabled = snapshot.lines.some(line => Number(qtys[line.id]) > 0 && !allocations[line.id]?.length);
  const onQuantity = (id: string, value: string) => setQtys(prev => ({ ...prev, [id]: value }));
  const messages = <CommandFormMessage error={error} />;
  if (result) return <ShipmentDoneView model={result} />;
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (busy || disabled) return;
    void run("ship_order", {
      orderId: snapshot.order.id, carrier: carrier || undefined, tracking: tracking || undefined, invoiceTiming,
      ship: buildShipLines(snapshot.lines, qtys, allocations, available),
    }, data => {
      if (transfer) { router.push(`/orders/${snapshot.order.id}`); return; }
      const invoiceId = (data as { invoice_id: string | null }).invoice_id;
      setResult(toShipmentDoneViewProps({ ...proposed, invoice: invoiceId ? { invoice_no: null } : null, invoiceHref: invoiceId ? `/invoices/${invoiceId}` : undefined }));
    });
  }}>
    {transfer
      ? <CompleteTransferView model={toCompleteTransferViewProps(proposed)} quantities={qtys} onQuantity={onQuantity} sources={sources} messages={messages} submitting={busy} disabled={disabled} />
      : <ShipView model={toShipViewProps(proposed)} quantities={qtys} onQuantity={onQuantity} carrier={carrier} tracking={tracking}
          onCarrier={setCarrier} onTracking={setTracking} onInvoiceTiming={setInvoiceTiming} sources={sources} messages={messages} submitting={busy} disabled={disabled} />}
  </form>;
}
