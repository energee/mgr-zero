import { InvoicesView } from "@/components/mgr/views/invoices";
import { toInvoiceListRow, type InvoiceListRecord } from "@/lib/mgr/invoices-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboSyncButton } from "@/app/(app)/settings/accounting/qbo-controls";

export default async function InvoicesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canManage = brewery.role === "admin" || brewery.role === "sales";
  const [invoices, health] = await Promise.all([
    runCommand("list_invoices", {}, ctx) as Promise<InvoiceListRecord[]>,
    canManage ? runCommand("get_qbo_connection", {}, ctx) as Promise<{ connected: boolean; state: string; realmLabel: string | null }> : null,
  ]);
  return <InvoicesView backHref="/more" rows={invoices.map(invoice => ({
    ...toInvoiceListRow(invoice, brewery.role, Boolean(health?.connected), brewery.timeZone), href: `/invoices/${invoice.id}`,
  }))} connection={health ? {
    connected: health.connected, detail: health.connected ? `connected · ${health.realmLabel ?? "verified company"}` : health.state.replaceAll("_", " "),
    canConnect: brewery.role === "admin", connectHref: "/settings/accounting/connect",
  } : undefined} sync={<QboSyncButton />} />;
}
