import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { deniedHref } from "@/lib/mgr/denied";
import { orNotFound } from "@/lib/mgr/not-found";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboMappingForm } from "@/app/(app)/settings/accounting/qbo-controls";

type Snapshot = { invoice: { id: string; customers: { id: string; name: string; qbo_customer_id: string | null } | null }; lines: { id: string; kind: string; sku_id: string | null; description: string; skus: { name: string; qbo_item_id: string | null } | null }[] };
export default async function InvoiceMappingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin" && brewery.role !== "sales") redirect(deniedHref("Fix mapping", ["admin", "sales"]));
  const snapshot = await orNotFound(runCommand("get_invoice", { invoiceId: id }, await buildContext(brewery.id)) as Promise<Snapshot>);
  const customer = snapshot.invoice.customers;
  return <>
    {E.back("Invoice", "Fix QuickBooks mapping", undefined, `/invoices/${id}`)}
    {E.info("Verify the intended record in the connected QuickBooks company. Similar names are never matched automatically.")}
    {customer && E.row(customer.name, customer.qbo_customer_id ? `QuickBooks customer ${customer.qbo_customer_id}` : "Customer mapping required", <QboMappingForm kind="customer" localId={customer.id} label={customer.name} currentId={customer.qbo_customer_id} />, customer.qbo_customer_id ? "ok" : "w")}
    {snapshot.lines.filter(line => line.kind === "sku" && line.sku_id).map(line => <div key={line.id}>{E.row(line.skus?.name ?? line.description, line.skus?.qbo_item_id ? `QuickBooks item ${line.skus.qbo_item_id}` : "Item mapping required", <QboMappingForm kind="item" localId={line.sku_id!} label={line.skus?.name ?? line.description} currentId={line.skus?.qbo_item_id} />, line.skus?.qbo_item_id ? "ok" : "w")}</div>)}
    {snapshot.lines.some(line => /keg_deposit/.test(line.kind)) && brewery.role === "admin" ? E.row("Returnable-keg deposit", "Configured from Accounting", E.act("Open Accounting mappings", "attention", "/settings/accounting/mappings")) : null}
  </>;
}
