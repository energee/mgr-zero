import { PosSaleDetailView } from "@/components/mgr/views/pos";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { money } from "@/lib/mgr/money";
import { orNotFound } from "@/lib/mgr/not-found";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";

type Sale = { id: string; factKind: "sale" | "return"; externalOrderId: string; externalLineId: string; itemName: string; variationName: string; factStatus: string; mappingLabel: string | null; mappingStatus: "mapped" | "queued" | "ignored" | "unsupported" | "removed"; grossCents: number | null; locationName: string; soldAt: string; quantity: string | null; expectedBbl: number | null; servingOunces: number | null; sourceOrderId: string | null; sourceLineId: string | null; sourceVersion: string; current: boolean };
type SaleDetail = { sale: Sale; revisions: Sale[] };

export default async function PosSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, brewery = await getActiveBrewery(), ctx = await buildContext(brewery.id);
  const data = await orNotFound(runCommand("get_pos_sale", { saleId: id }, ctx)) as SaleDetail;
  const sale = data.sale;
  return <PosSaleDetailView live title={`Square ${sale.factKind} ${sale.externalOrderId}`} sale={{
    id: sale.id, label: `${sale.itemName} · ${sale.variationName}`, detail: `${sale.factStatus} · ${sale.mappingLabel ?? sale.mappingStatus}`,
    amount: sale.grossCents == null ? "No amount" : money(sale.grossCents), status: sale.mappingStatus,
    location: sale.locationName, soldAt: new Date(sale.soldAt).toLocaleString(), quantity: sale.quantity ?? "Not supplied",
    expected: sale.expectedBbl == null ? "Not available until mapped" : `${sale.expectedBbl} bbl${sale.servingOunces == null ? "" : ` · ${sale.servingOunces} oz`}`,
    source: `order ${sale.sourceOrderId ?? sale.externalOrderId} · line ${sale.sourceLineId ?? sale.externalLineId} · revision ${sale.sourceVersion}`,
  }} revisions={data.revisions.map(row => ({
    label: `Revision ${row.sourceVersion} · ${row.factKind}`, detail: `${row.factStatus} · ${row.quantity ?? "no quantity"} · ${row.mappingLabel ?? row.mappingStatus}`,
    current: row.current,
  }))} />;
}
