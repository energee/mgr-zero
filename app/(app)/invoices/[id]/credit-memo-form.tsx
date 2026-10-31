"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ReturnCreditView, ReturnSourcesView } from "@/components/mgr/views/return-credit";
import { RETURN_REASONS, returnCreditReason, toReturnCreditViewProps } from "@/lib/mgr/return-credit-view";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ReturnSource } from "@/lib/commands/orders";

/** A creditable invoice line: beer (`sku`, returns as stock from its shipped
 *  sources) or a keg deposit (`keg_deposit`, refunded in whole kegs, no stock). */
export type ReturnLine = { id: string; label: string; qty: number } & ({ kind: "sku"; skuId: string } | { kind: "keg_deposit"; skuId: null });

export function buildReturnLines(lines: ReturnLine[], qtys: Record<string, string>, sources: ReturnSource[], sourceQtys: Record<string, string>, binId: string, shipmentId: string | null) {
  return lines.filter(l => Number(qtys[l.id] ?? 0) > 0).map(l => ({
    invoiceLineId: l.id,
    qty: Number(qtys[l.id]),
    ...(shipmentId === null || l.kind === "keg_deposit" ? {} : {
      sources: sources.filter(s => s.sku_id === l.skuId && Number(sourceQtys[s.id]) > 0)
        .map(s => ({ movementId: s.id, binId, qty: Number(sourceQtys[s.id]) })),
    }),
  }));
}

export function CreditMemoForm({ invoiceId, invoiceNo, shipmentId, refusedDeliveryId, refusedQuantities, lines, locations, sources, bins }: {
  invoiceId: string; invoiceNo: number | null; shipmentId: string | null; refusedDeliveryId?: string; refusedQuantities?: Record<string, number>;
  lines: (ReturnLine & { unitPriceCents: number })[];
  locations: { id: string; name: string }[]; sources: ReturnSource[];
  bins: { id: string; name: string; location_id: string }[];
}) {
  const router = useRouter();
  const [sourceQtys, setSourceQtys] = useState<Record<string, string>>({});
  const [binId, setBinId] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState<"damaged" | "wrong_item" | "unsold" | "">("");
  const [returnEmptyKegs, setReturnEmptyKegs] = useState(false);
  const { busy, error, run } = useCommandAction();
  const beerLines = lines.filter(line => line.kind === "sku");
  const returningBeer = beerLines.some(line => Number(qtys[line.id]) > 0);
  const model = toReturnCreditViewProps({
    invoice: { invoice_no: invoiceNo }, refusedDeliveryId, locations, returnLocationId: locationId, reason, backHref: `/invoices/${invoiceId}`,
    lines: lines.map(line => ({ id: line.id, qty_shipped: line.qty, qty_returnable: refusedQuantities && line.kind === "sku" ? refusedQuantities[line.skuId] ?? 0 : undefined, qty_returning: Number(qtys[line.id] ?? 0), unit_price_cents: line.unitPriceCents, skus: { name: line.label }, kind: line.kind })),
  });
  const checkInEmpty = returnEmptyKegs && !returningBeer;
  const blockedReason = returnCreditReason({ lines: model.lines, quantities: qtys, reason, locationId, returnEmptyKegs: checkInEmpty, binMissing: (shipmentId !== null || checkInEmpty) && !binId });
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (busy || blockedReason) return;
    void run("return_shipment", { invoiceId, refusedDeliveryId, locationId: locationId || undefined, reason: returningBeer ? reason : undefined, returnEmptyKegs: checkInEmpty, binId: checkInEmpty ? binId : undefined, lines: buildReturnLines(lines, qtys, sources, sourceQtys, binId, shipmentId) },
      () => router.push(`/invoices/${invoiceId}`));
  }}>
    <ReturnCreditView model={model} quantities={qtys} onQuantity={(id, value) => setQtys(prev => ({ ...prev, [id]: value }))}
      onReason={index => setReason(RETURN_REASONS[index]?.id ?? "")}
      onReturnTo={id => { setLocationId(id); setBinId(""); }}
      returnEmptyKegs={checkInEmpty} onReturnEmptyKegs={setReturnEmptyKegs}
      bins={shipmentId === null && !checkInEmpty ? undefined : bins.filter(bin => bin.location_id === locationId)} binId={binId} onBin={setBinId}
      sources={shipmentId === null || !returningBeer ? null : <ReturnSourcesView groups={beerLines.filter(line => Number(qtys[line.id]) > 0).map(line => ({
        key: line.id, name: line.label, sources: sources.filter(source => source.sku_id === line.skuId).map(source => ({
          id: source.id, label: `${source.lots?.code ?? "Untracked / legacy stock"} · shipped from ${source.bins?.name ?? "—"}`, shipped: -Number(source.qty),
        })),
      }))} quantities={sourceQtys} onQuantity={(id, value) => setSourceQtys(prev => ({ ...prev, [id]: value }))} />}
      submitting={busy} blockedReason={blockedReason} messages={<CommandFormMessage error={error} />} />
  </form>;
}
