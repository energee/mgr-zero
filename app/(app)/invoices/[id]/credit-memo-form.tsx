"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ReturnCreditView, ReturnSourcesView } from "@/components/mgr/views/return-credit";
import { RETURN_REASONS, toReturnCreditViewProps } from "@/lib/mgr/return-credit-view";
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

export function CreditMemoForm({ invoiceId, invoiceNo, shipmentId, lines, locations, sources, bins }: {
  invoiceId: string; invoiceNo: number | null; shipmentId: string | null;
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
  const { busy, error, run } = useCommandAction();
  const beerLines = lines.filter(line => line.kind === "sku");
  const returningBeer = beerLines.some(line => Number(qtys[line.id]) > 0);
  const disabled = !reason || !locationId || (shipmentId !== null && returningBeer && !binId) || !lines.some(line => Number(qtys[line.id]) > 0);
  const model = toReturnCreditViewProps({
    invoice: { invoice_no: invoiceNo }, locations, returnLocationId: locationId, reason, backHref: `/invoices/${invoiceId}`,
    lines: lines.map(line => ({ id: line.id, qty_shipped: line.qty, qty_returning: Number(qtys[line.id] ?? 0), unit_price_cents: line.unitPriceCents, skus: { name: line.label }, kind: line.kind })),
  });
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (busy || disabled) return;
    void run("return_shipment", { invoiceId, locationId, reason, lines: buildReturnLines(lines, qtys, sources, sourceQtys, binId, shipmentId) },
      () => router.push(`/invoices/${invoiceId}`));
  }}>
    <ReturnCreditView model={model} quantities={qtys} onQuantity={(id, value) => setQtys(prev => ({ ...prev, [id]: value }))}
      onReason={index => setReason(RETURN_REASONS[index]?.id ?? "")}
      onReturnTo={id => { setLocationId(id); setBinId(""); }}
      bins={shipmentId === null ? undefined : bins.filter(bin => bin.location_id === locationId)} binId={binId} onBin={setBinId}
      sources={shipmentId === null ? null : <ReturnSourcesView groups={beerLines.map(line => ({
        key: line.id, name: line.label, sources: sources.filter(source => source.sku_id === line.skuId).map(source => ({
          id: source.id, label: `${source.lots?.code ?? "Untracked / legacy stock"} · shipped from ${source.bins?.name ?? "—"}`, shipped: -Number(source.qty),
        })),
      }))} quantities={sourceQtys} onQuantity={(id, value) => setSourceQtys(prev => ({ ...prev, [id]: value }))} />}
      submitting={busy} disabled={disabled} messages={<CommandFormMessage error={error} />} />
  </form>;
}
