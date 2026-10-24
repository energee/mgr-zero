import { cache } from "react";
import { redirect } from "next/navigation";
import { QboMappingsView } from "@/components/mgr/views/qbo-mapping";
import { getActiveBrewery } from "@/lib/brewery";
import { deniedHref } from "@/lib/mgr/denied";
import { getInvoicePageData } from "../../invoice-data";
import "@/lib/commands/all";
import { QboMappingForm } from "@/app/(app)/settings/accounting/qbo-controls";
import { navTitle } from "@/lib/mgr/nav";

const getMappingPageData = cache(async function getMappingPageData(id: string) {
  const brewery = await getActiveBrewery();
  if (!brewery.roles.includes("admin") && !brewery.roles.includes("sales")) redirect(deniedHref("Fix mapping", ["admin", "sales"]));
  return getInvoicePageData(id);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getMappingPageData(id);
  return { title: navTitle("/invoices") };
}

type Snapshot = { invoice: { id: string; customers: { id: string; name: string; qbo_customer_id: string | null } | null }; lines: { id: string; kind: string; sku_id: string | null; description: string; skus: { name: string; qbo_item_id: string | null } | null }[] };
export default async function InvoiceMappingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, snapshot: data } = await getMappingPageData(id);
  const snapshot = data as Snapshot;
  const customer = snapshot.invoice.customers;
  return <QboMappingsView title="Fix QuickBooks mapping" backLabel="Invoice" backHref={`/invoices/${id}`} context="invoice" sections={[
    { rows: customer ? [{ id: customer.id, label: customer.name, kind: "customer", currentId: customer.qbo_customer_id, detail: "Customer mapping required", action: <QboMappingForm context="invoice" kind="customer" localId={customer.id} label={customer.name} currentId={customer.qbo_customer_id} /> }] : [] },
    { rows: snapshot.lines.filter(line => line.kind === "sku" && line.sku_id).map(line => ({ id: line.id, label: line.skus?.name ?? line.description, kind: "item", currentId: line.skus?.qbo_item_id, detail: "Item mapping required", action: <QboMappingForm context="invoice" kind="item" localId={line.sku_id!} label={line.skus?.name ?? line.description} currentId={line.skus?.qbo_item_id} /> })) },
  ]} depositHref={snapshot.lines.some(line => /keg_deposit/.test(line.kind)) && brewery.roles.includes("admin") ? "/settings/accounting/mappings" : undefined} />;
}
