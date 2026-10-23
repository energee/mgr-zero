// components/mgr/views/invoices.tsx — the staff Invoices register, drawn by the
// shared RecordTable from structured invoice facts; financial detail is never
// recovered from display text. The document number is each row's one link; a
// row without an href (the inventory) draws it as an inert tap.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import type { InvoiceListRow } from "@/lib/mgr/invoices-view";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { QboSyncView } from "./accounting";
import { RecordTable } from "./record-table";

/** The current total, with the local subtotal under it when an accountant edited the invoice. */
const total = (row: InvoiceListRow) => <Fragment key="total">
  {row.total.value}
  {row.localSubtotal && <span className="block text-muted-foreground">Local subtotal {row.localSubtotal.value}</span>}
</Fragment>;

/** Accounting exceptions only: an ordinary row has none and says nothing. */
function accounting(row: InvoiceListRow) {
  if (!row.accounting && !row.needsMapping && !row.quickbooksHref) return null;
  return <div key="accounting" className="flex min-w-0 flex-col items-start gap-1">
    {row.needsMapping && E.status("Needs mapping", "w")}
    {row.accounting}
    {/* E.btn ends a group on the right on the desk; the span keeps it on the column's left edge. */}
    {row.quickbooksHref && <span>{E.btn("Open in QuickBooks", "g", row.quickbooksHref)}</span>}
  </div>;
}

function Register({ rows }: { rows: InvoiceListRow[] }) {
  return <RecordTable
    headers={["Document", "Customer", "Total", "Balance", "Due", "Payment", "Accounting"]}
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
        row.overdue ? <Fragment key="due">{E.status("Overdue", "w")} {row.due.value}</Fragment> : row.due.value,
        row.payment,
        accounting(row),
      ],
      // Money by its cents and Due by its day, so the local subtotal line, an
      // Overdue badge, or "Unavailable" never decides the order (null sorts last).
      sort: [row.document.number, row.customer, row.total.cents, row.balance.cents, row.due.day],
    }))}
  />;
}

/** The staff Invoices register. `sync` is the manual sync control: the live
 *  page passes its QboSyncButton, the inventory a QboSyncView with fixture
 *  status; omitted, a static QboSyncView is drawn. */
export function InvoicesView({ rows, backHref, connection, sync, pagination }: { pagination?: HistoryNavigationProps; rows: InvoiceListRow[]; backHref?: string; connection?: { connected: boolean; detail: string; connectHref?: string; canConnect: boolean }; sync?: ReactNode }) {
  return <>
    {E.back("More", "Invoices", undefined, backHref)}
    {connection ? E.row("QuickBooks", connection.detail, connection.connected ? "" : connection.canConnect ? E.act("Connect", "attention", connection.connectHref) : "Admin must connect", connection.connected ? "ok" : "w", QuickBooksMark) : E.fld("QuickBooks", "Financial actions require Admin or Sales")}
    {/* Sync needs a live connection; while disconnected the QuickBooks row above carries the only next step. */}
    {connection?.connected && (sync !== undefined ? sync : <QboSyncView />)}
    {connection && !connection.connected && E.info("Payment status may be stale until QuickBooks is reconnected and synced.")}
    {rows.length ? <Register rows={rows} /> : E.blank("No invoices yet")}
    <HistoryNavigation {...pagination} />
    {E.gated("Email delivery status", "MGR can’t tell whether QuickBooks emailed an invoice.")}
  </>;
}
