import { qboCompanyName, toQboSyncViewProps, type QboHealth, type QboSyncStatus } from "@/lib/mgr/accounting-view";
import { historyPage, pageCursor, type HistoryPage, type HistoryRow } from "@/lib/mgr/history-page";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { invoiceStatusOptions, toInvoiceListRow, type InvoiceFilter, type InvoiceListRecord } from "@/lib/mgr/invoices-view";
import { getActiveBrewery } from "@/lib/brewery";
import { connectionStateLabel } from "@/lib/mgr/labels";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboSyncButton } from "@/app/(app)/settings/accounting/qbo-controls";
import { navTitle } from "@/lib/mgr/nav";
import { isQboConfigured } from "@/lib/qbo";

export const metadata = { title: navTitle("/invoices") };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[]; status?: string | string[] }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const cursor = pageCursor(params.cursor);
  // ?status=unpaid narrows list_invoices; any other value lists every invoice.
  const status: InvoiceFilter | undefined = params.status === "unpaid" ? "unpaid" : undefined;
  const ctx = await buildContext(brewery.id);
  const canManage = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  const [records, health, syncStatus] = await Promise.all([
    runCommand("list_invoices", { cursor, status }, ctx) as Promise<HistoryPage<InvoiceListRecord & HistoryRow>>,
    canManage ? runCommand("get_qbo_connection", {}, ctx) as Promise<QboHealth> : null,
    canManage ? runCommand("get_qbo_sync_status", {}, ctx) as Promise<QboSyncStatus> : null,
  ]);
  const page = historyPage(records, "/invoices", cursor, { status });
  return <InvoicesView pagination={page.pagination} backHref="/more" status={status} statusOptions={invoiceStatusOptions(true)} rows={page.rows.map(invoice => ({
    ...toInvoiceListRow(invoice, brewery.roles, Boolean(health?.connected), brewery.timeZone), href: `/invoices/${invoice.id}`,
  }))} connection={health ? {
    connected: health.connected, detail: health.connected ? `Connected · ${qboCompanyName(health) ?? "verified company"}` : connectionStateLabel(health.state),
    configured: isQboConfigured(), reconnect: Boolean(health.connectionId),
    canConnect: brewery.roles.includes("admin"), connectHref: "/settings/accounting/connect",
  } : undefined} sync={<QboSyncButton status={syncStatus ? toQboSyncViewProps(syncStatus, brewery.timeZone) : undefined} />} />;
}
