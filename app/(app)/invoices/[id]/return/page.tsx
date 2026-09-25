// Return page: credit an invoice's beer lines (back to stock, or to loss when
// damaged) and refund its keg deposit lines, in one return_shipment credit memo.
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ReturnSource } from "@/lib/commands/orders";
import { SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { CreditMemoForm, type ReturnLine } from "../credit-memo-form";
import "@/lib/commands/all";

type Invoice = { id: string; invoice_no: number | null; shipment_id: string | null; kind: string };
type Line = { id: string; kind: string; sku_id: string | null; keg_size: string | null; qty: number; unit_price_cents: number; description: string; skus: { name: string } | null };

export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "return_shipment");
  const [{ invoice, lines }, locations, sources, bins] = await Promise.all([
    orNotFound(runPageQuery("get_invoice", { invoiceId: id }, ctx)) as Promise<{ invoice: Invoice; lines: Line[] }>,
    runPageQuery("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
    orNotFound(runPageQuery("get_invoice_return_sources", { invoiceId: id }, ctx)) as Promise<ReturnSource[]>,
    runPageQuery("list_bins", {}, ctx) as Promise<{ id: string; name: string; location_id: string }[]>,
  ]);
  if (invoice.kind !== "invoice") redirect(`/invoices/${invoice.id}`);
  return <CreditMemoForm invoiceId={invoice.id} invoiceNo={invoice.invoice_no} shipmentId={invoice.shipment_id}
    lines={lines.flatMap((line): (ReturnLine & { unitPriceCents: number })[] => line.kind === "sku" && line.sku_id
      ? [{ id: line.id, kind: "sku", skuId: line.sku_id, label: line.skus?.name ?? line.description, qty: Number(line.qty), unitPriceCents: Number(line.unit_price_cents) }]
      : line.kind === "keg_deposit"
        ? [{ id: line.id, kind: "keg_deposit", skuId: null, label: line.keg_size ? `${line.description} · ${SIZE_LABEL[line.keg_size] ?? line.keg_size}` : line.description, qty: Number(line.qty), unitPriceCents: Number(line.unit_price_cents) }]
        : [])}
    locations={locations} sources={sources} bins={bins} />;
}
