import { historyPage, pageCursor, HISTORY_PAGE_SIZE, type HistoryRow } from "@/lib/mgr/history-page";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { toInvoiceListRow, type InvoiceListRecord } from "@/lib/mgr/invoices-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboSyncButton } from "@/app/(app)/settings/accounting/qbo-controls";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ cursor?: string | string[] }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const cursor = pageCursor(params.cursor);
  const ctx = await buildContext(brewery.id);
  const canManage = brewery.role === "admin" || brewery.role === "sales";
  const [records, health] = await Promise.all([
    runCommand("list_invoices", { cursor, limit: HISTORY_PAGE_SIZE + 1 }, ctx) as Promise<(InvoiceListRecord & HistoryRow)[]>,
    canManage ? runCommand("get_qbo_connection", {}, ctx) as Promise<{ connected: boolean; state: string; realmLabel: string | null }> : null,
  ]);
  const page = historyPage(records, "/invoices", cursor);
  return <InvoicesView pagination={page.pagination} backHref="/more" rows={page.rows.map(invoice => ({
    ...toInvoiceListRow(invoice, brewery.role, Boolean(health?.connected), brewery.timeZone), href: `/invoices/${invoice.id}`,
  }))} connection={health ? {
    connected: health.connected, detail: health.connected ? `connected · ${health.realmLabel ?? "verified company"}` : health.state.replaceAll("_", " "),
    canConnect: brewery.role === "admin", connectHref: "/settings/accounting/connect",
  } : undefined} sync={<QboSyncButton />} />;
}
