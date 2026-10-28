// components/mgr/views/invoices.tsx — the staff Invoices register, drawn by the
// shared RecordTable from structured invoice facts; financial detail is never
// recovered from display text. The document number is each row's one link; a
// row without an href (the inventory) draws it as an inert tap. Filters and
// invoices lead; healthy QuickBooks status follows. Eligible rows carry Record payment.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import { ScopePick, type ScopeOption } from "@/components/mgr/scope-pick";
import { invoiceStatusOptions, type InvoiceFilter, type InvoiceListRow } from "@/lib/mgr/invoices-view";
import { integrationUnavailableReason } from "@/lib/mgr/integration-availability";
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

/** A row's Record payment control: the live form from the caller; null for a
 *  viewer who may not record payments; undefined (the inventory) the inert button. */
type RecordPaymentSlot = null | ((row: InvoiceListRow) => ReactNode);

/** The Payment fact, with Record payment under it on a row that takes one. */
function payment(row: InvoiceListRow, recordPayment: RecordPaymentSlot | undefined) {
  if (row.paymentBalanceCents == null || recordPayment === null) return row.payment;
  const action = recordPayment ? recordPayment(row) : <Button variant="outline" size="sm" type="button">Record payment</Button>;
  return <div key="payment" className="flex min-w-0 flex-col items-start gap-1">{row.payment}{action}</div>;
}

function Register({ rows, recordPayment }: { rows: InvoiceListRow[]; recordPayment?: RecordPaymentSlot }) {
  return <RecordTable
    headers={["Document", "Customer", "Total", "Balance", "Due", "Payment", "Accounting"]}
    align={["l", "l", "r", "r", "l", "l", "l"]}
    rows={rows.map(row => ({
      key: row.id,
      href: row.href,
      to: "Invoice",
      // INV- already says invoice; only the exception is labeled.
      note: row.document.kind === "credit_memo" ? "Credit memo" : undefined,
      cells: [
        row.document.number,
        row.customer,
        total(row),
        row.balance.value,
        row.overdue ? <Fragment key="due">{E.status("Overdue", "w")} {row.due.value}</Fragment> : row.due.value,
        payment(row, recordPayment),
        accounting(row),
      ],
      // Money by its cents and Due by its day, so the local subtotal line, an
      // Overdue badge, or "Unavailable" never decides the order (null sorts
      // last); Payment by its fact, never its Record payment button.
      sort: [row.document.number, row.customer, row.total.cents, row.balance.cents, row.due.day, row.payment],
    }))}
  />;
}

/** The staff Invoices register. `sync` is the manual sync control: the live
 *  page passes its QboSyncButton, the inventory a QboSyncView with fixture
 *  status; omitted, a static QboSyncView is drawn. `statusOptions` supplies
 *  linked live filters or inert fixture choices. `recordPayment` supplies
 *  the live payment form; omitted draws the inert button, null hides it. */
export function InvoicesView({ rows, backHref, connection, sync, pagination, status, statusOptions = invoiceStatusOptions(false), recordPayment }: { pagination?: HistoryNavigationProps; rows: InvoiceListRow[]; backHref?: string; connection?: { connected: boolean; configured?: boolean; reconnect?: boolean; detail: string; connectHref?: string; canConnect: boolean }; sync?: ReactNode; status?: InvoiceFilter; statusOptions?: ScopeOption[]; recordPayment?: RecordPaymentSlot }) {
  let connectAction: ReactNode = null;
  if (connection && !connection.connected) {
    if (connection.configured === false) connectAction = E.act("Connect", "attention", undefined, undefined, true);
    else if (connection.canConnect) connectAction = E.act("Connect", "attention", connection.connectHref);
    else connectAction = "Admin must connect";
  }
  const quickbooks = <>
    {connection ? E.row("QuickBooks", connection.detail, connectAction, connection.connected ? "ok" : "w", QuickBooksMark) : E.fld("QuickBooks", "Financial actions require Admin or Sales")}
    {connection && !connection.connected && connection.configured === false && <p className="text-sm text-muted-foreground">{integrationUnavailableReason.quickbooks}</p>}
    {/* Sync needs a live connection; while disconnected the QuickBooks row carries the only next step. */}
    {connection?.connected && (sync !== undefined ? sync : <QboSyncView />)}
  </>;
  return <>
    {E.back("More", "Invoices", undefined, backHref)}
    {/* A missing connection is a next step, so it leads; a healthy status follows the rows. */}
    {connection && !connection.connected && quickbooks}
    {(rows.length > 0 || status) && <ScopePick label="Show" value={status ?? "all"} options={statusOptions} />}
    {connection && !connection.connected && connection.reconnect && E.info("Payment status may be stale until QuickBooks is reconnected and synced.")}
    {rows.length ? <Register rows={rows} recordPayment={recordPayment} />
      : status ? E.blank({ title: "No unpaid invoices", description: "Every invoice here is paid, settled, written off or voided." })
      : E.blank({ title: "No invoices yet", description: "Invoices show here after you ship an order. You can then push them to QuickBooks or record payments in MGR." })}
    <HistoryNavigation {...pagination} />
    {(!connection || connection.connected) && quickbooks}
    <div>
      {E.gated("Email delivery status", "Unavailable")}
      {E.polite("MGR can’t tell whether QuickBooks emailed an invoice.")}
    </div>
  </>;
}
