import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import type { InvoiceListRow } from "@/lib/mgr/invoices-view";
import { QboSyncView, QboStaffInvoiceLinkView } from "./accounting";

export function InvoicesView({ rows, backHref, connection, sync, pagination }: { pagination?: HistoryNavigationProps; rows: InvoiceListRow[]; backHref?: string; connection?: { connected: boolean; detail: string; connectHref?: string; canConnect: boolean }; sync?: ReactNode }) {
  return <>
    {E.back("More", "Invoices", undefined, backHref)}
    {connection ? E.row("QuickBooks", connection.detail, connection.connected ? "Manual sync" : connection.canConnect ? E.act("Connect", "attention", connection.connectHref) : "Admin must connect", connection.connected ? "ok" : "w", QuickBooksMark) : E.fld("QuickBooks", "Financial actions require Admin or Sales")}
    {connection && (sync !== undefined ? sync : <QboSyncView disabled={!connection.connected} />)}
    {!rows.length ? E.blank("No invoices yet") : rows.map(row => <div key={row.id} className="flex flex-col gap-2 [&_[data-slot=item-description]]:line-clamp-none">
      {E.row(row.title, row.detail, <div className="flex flex-wrap justify-end gap-2">{E.act("Open", "primary", row.href)}{row.actions.map(action => <span key={action}>{E.act(action, action === "Write off" ? "destructive" : "attention", row.href)}</span>)}</div>, row.tone)}
      {row.remoteReview && <QboStaffInvoiceLinkView link={row.staffLink} />}
    </div>)}
    <HistoryNavigation {...pagination} />
    {E.info("MGR shows what changed over there. Corrections belong in QuickBooks, or as a credit memo here.")}
    {E.gated("Email delivery status", "The current invoice query does not report whether QuickBooks emailed an invoice.")}
  </>;
}
