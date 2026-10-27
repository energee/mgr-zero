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
import type { KegShortage } from "@/lib/mgr/keg-fleet-view";
import { submitReason } from "@/lib/mgr/submit-reason";

export type ShippingSnapshot = ShipSnapshot & { order: ShipSnapshot["order"] & { kind: string; to_location_id: string | null } };

/** The ship_order lines: quantities, chosen sources, and a trimmed reason for
 *  each line shipped below picked (the server refuses one without). */
export function buildShipLines(lines: ShippingSnapshot["lines"], qtys: Record<string, string>, allocations: ShipmentAllocations, available: ShipSources, reasons: Record<string, string> = {}) {
  return lines.map(line => ({
    lineId: line.id, qty: Number(qtys[line.id]),
    shortReason: Number(qtys[line.id]) < Number(line.qty_picked ?? 0) ? reasons[line.id]?.trim() || undefined : undefined,
    sources: Number(qtys[line.id]) === 0 ? [] : (allocations[line.id] ?? []).map(row => {
      const source = available.stock.find(stock => `${stock.bin_id}:${stock.lot_id ?? ""}` === row.key && stock.stock_id === line.sku_id);
      return { binId: source?.bin_id, lotId: source?.lot_id ?? null, qty: Number(row.qty), toBinId: row.toBinId || undefined };
    }),
  }));
}

/** Ship's starting sources (#1504): a line starts with one source when exactly
 *  one recorded bin and lot holds its whole quantity; any other line waits for
 *  the user to choose. A transfer's only destination bin, if it has just one,
 *  is chosen too. */
export function defaultShipAllocations(lines: ShippingSnapshot["lines"], qtys: Record<string, string>, available: ShipSources): ShipmentAllocations {
  const toBinId = available.destinationBins.length === 1 ? available.destinationBins[0].id : "";
  return Object.fromEntries(lines.flatMap(line => {
    const quantity = Number(qtys[line.id]);
    const covering = available.stock.filter(stock => stock.stock_id === line.sku_id && stock.qty >= quantity);
    if (!(quantity > 0) || covering.length !== 1) return [];
    return [[line.id, [{ key: `${covering[0].bin_id}:${covering[0].lot_id ?? ""}`, qty: String(quantity), toBinId }]]];
  }));
}

/** Missing source details, including totals and duplicate bin/lot selections. */
export function shipmentSourceNeeds(lines: ShippingSnapshot["lines"], qtys: Record<string, string>, allocations: ShipmentAllocations, available: ShipSources, transfer: boolean): string[] {
  return lines.flatMap(line => {
    const quantity = Number(qtys[line.id]);
    if (!(quantity > 0)) return [];
    const name = line.skus?.name ?? "Line";
    const rows = allocations[line.id] ?? [];
    const missing: string[] = [];
    if (!available.stock.some(stock => stock.stock_id === line.sku_id)) missing.push(`recorded stock of ${name} in a bin at the ship-from location`);
    else if (!rows.length || rows.some(row => !available.stock.some(stock => stock.stock_id === line.sku_id && `${stock.bin_id}:${stock.lot_id ?? ""}` === row.key))) {
      missing.push(`a source bin and lot for ${name}`);
    }
    const validQuantities = rows.every(row => row.qty.trim() !== "" && Number.isFinite(Number(row.qty)) && Number(row.qty) > 0);
    if (!validQuantities) missing.push(`a source quantity above zero for ${name}`);
    if (transfer && rows.some(row => !row.toBinId)) missing.push(`a destination bin for ${name}`);
    if (rows.length && validQuantities) {
      const total = rows.reduce((sum, row) => sum + Number(row.qty), 0);
      if (Math.abs(total - quantity) > 1e-9) missing.push(`source quantities totaling ${quantity} for ${name} (currently ${total})`);
    }
    const keys = rows.map(row => row.key).filter(Boolean);
    if (new Set(keys).size !== keys.length) missing.push(`each bin and lot chosen only once for ${name}`);
    return missing;
  });
}

/** Match ship_order: save a submitted shortage reason, otherwise keep the
 *  persisted short-pick reason rather than an unsaved edit. */
export function shippedLines(lines: ShippingSnapshot["lines"], ship: ReturnType<typeof buildShipLines>) {
  return lines.map((line, i) => ({ ...line, qty_shipped: ship[i].qty, short_reason: ship[i].shortReason ?? line.short_reason ?? null }));
}

export function ShipForm({ snapshot, available }: { snapshot: ShippingSnapshot; available: ShipSources }) {
  const router = useRouter();
  const transfer = snapshot.order.kind === "taproom_transfer";
  const { busy, error, setError, run } = useCommandAction();
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(snapshot.lines.map(line => [line.id, String(line.qty_picked ?? 0)])));
  const [allocations, setAllocations] = useState<ShipmentAllocations>(() => defaultShipAllocations(snapshot.lines, qtys, available));
  const [reasons, setReasons] = useState<Record<string, string>>(() => Object.fromEntries(snapshot.lines.map(line => [line.id, line.short_reason ?? ""])));
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [invoiceTiming, setInvoiceTiming] = useState<"now" | "on_delivery">("now");
  const [result, setResult] = useState<ShipmentDoneViewModel | null>(null);
  const proposed = { ...snapshot, invoiceTiming, lines: snapshot.lines.map(line => ({ ...line, qty_shipped: Number(qtys[line.id]) })) };
  // A pickup order ships invoiced now (ship_order refuses on_delivery for it); the model says which.
  const model = toShipViewProps(proposed);
  const sources = <ShipmentSourcesView lines={snapshot.lines.map(line => ({
    key: line.id, name: line.skus?.name ?? "Line", qty: Number(qtys[line.id]),
    options: available.stock.filter(stock => stock.stock_id === line.sku_id).map(stock => ({
      key: `${stock.bin_id}:${stock.lot_id ?? ""}`,
      label: `${available.bins.find(bin => bin.id === stock.bin_id)?.name ?? stock.bin_id} · ${stock.lot_code ?? "Untracked / legacy stock"} · ${stock.qty} available`,
    })),
  }))} allocations={allocations} onChange={value => { setError(null); setAllocations(value); }} destinationBins={available.destinationBins} disabled={busy} />;
  const reason = submitReason(shipmentSourceNeeds(snapshot.lines, qtys, allocations, available, transfer));
  // A refused ship's error describes the old quantities; editing them clears it (#1385).
  const onQuantity = (id: string, value: string) => { setError(null); setQtys(prev => ({ ...prev, [id]: value })); };
  const messages = <CommandFormMessage error={error} />;
  if (result) return <ShipmentDoneView model={result} />;
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (busy || reason) return;
    const ship = buildShipLines(snapshot.lines, qtys, allocations, available, reasons);
    void run("ship_order", {
      orderId: snapshot.order.id, carrier: carrier || undefined, tracking: tracking || undefined, invoiceTiming: model.invoiceTiming, ship,
    }, data => {
      if (transfer) { router.push(`/orders/${snapshot.order.id}`); return; }
      const { invoice_id: invoiceId, warnings } = data as { invoice_id: string | null; warnings?: KegShortage[] };
      setResult(toShipmentDoneViewProps({ ...proposed, warnings, lines: shippedLines(snapshot.lines, ship), invoice: invoiceId ? { invoice_no: null } : null, invoiceHref: invoiceId ? `/invoices/${invoiceId}` : undefined }));
    });
  }}>
    {transfer
      ? <CompleteTransferView model={toCompleteTransferViewProps(proposed)} quantities={qtys} onQuantity={onQuantity} sources={sources} messages={messages} submitting={busy} reason={reason} />
      : <ShipView model={model} quantities={qtys} onQuantity={onQuantity}
          reasons={reasons} onReason={(id, value) => setReasons(prev => ({ ...prev, [id]: value }))} carrier={carrier} tracking={tracking}
          onCarrier={setCarrier} onTracking={setTracking} onInvoiceTiming={setInvoiceTiming} sources={sources} messages={messages} submitting={busy} reason={reason} />}
  </form>;
}
