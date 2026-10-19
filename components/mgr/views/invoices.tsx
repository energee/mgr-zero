// components/mgr/views/invoices.tsx — the staff Invoices register, drawn by the
// shared RecordTable from structured invoice facts; financial detail is never
// recovered from display text. The document number is each row's one link; a
// row without an href (the inventory) draws it as an inert tap.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import type { InvoiceListRow } from "@/lib/mgr/invoices-view";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { QboSyncView } from "./accounting";
import { RecordTable } from "./record-table";

/** The current total, with the local subtotal under it when an accountant edited the invoice. */
const total = (row: InvoiceListRow) => <>
  {row.total.value}
  {row.localSubtotal && <span className="block text-muted-foreground">Local subtotal {row.localSubtotal.value}</span>}
</>;

/** Accounting exceptions only: an ordinary row has none and says nothing. */
function accounting(row: InvoiceListRow) {
  if (!row.accounting && !row.needsMapping && !row.quickbooksHref) return null;
  return <div className="flex min-w-0 flex-col items-end gap-1">
    {row.needsMapping && E.status("Needs mapping", "w")}
    {row.accounting}
    {row.quickbooksHref && E.btn("Open in QuickBooks", "g", row.quickbooksHref)}
  </div>;
}

function Register({ rows }: { rows: InvoiceListRow[] }) {
  return <RecordTable
    headers={["Document", "Customer", "Total", "QuickBooks balance", "Due", "Payment", "Accounting"]}
    align={["l", "l", "r", "r", "l", "l", "l"]}
    rows={rows.map(row => ({
      key: row.id,
      href: row.href,
      to: "Invoice",
      note: row.document.kind === "credit_memo" ? "Credit memo" : "Invoice",
      cells: [
        row.document.number,
        row.customer,
        total(row),
        row.balance.value,
        row.overdue ? <>{E.status("Overdue", "w")} {row.due.value}</> : row.due.value,
        row.payment,
        accounting(row),
      ],
    }))}
  />;
}

export function InvoicesView({ rows, backHref, connection, sync, pagination }: { pagination?: HistoryNavigationProps; rows: InvoiceListRow[]; backHref?: string; connection?: { connected: boolean; detail: string; connectHref?: string; canConnect: boolean }; sync?: ReactNode }) {
  return <>
    {E.back("More", "Invoices", undefined, backHref)}
    {connection ? E.row("QuickBooks", connection.detail, connection.connected ? "" : connection.canConnect ? E.act("Connect", "attention", connection.connectHref) : "Admin must connect", connection.connected ? "ok" : "w", QuickBooksMark) : E.fld("QuickBooks", "Financial actions require Admin or Sales")}
    {connection && (sync !== undefined ? sync : <QboSyncView disabled={!connection.connected} />)}
    {rows.length ? <Register rows={rows} /> : E.blank("No invoices yet")}
    <HistoryNavigation {...pagination} />
    {E.gated("Email delivery status", "The current invoice query does not report whether QuickBooks emailed an invoice.")}
  </>;
}
