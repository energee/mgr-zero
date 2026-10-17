// components/mgr/views/invoices.tsx — the staff Invoices register. The desktop
// table and phone rows consume the same structured invoice facts; financial
// detail is never recovered from display text.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Item, ItemContent, ItemGroup, ItemHeader, ItemSeparator } from "@/components/ui/item";
import type { InvoiceListRow } from "@/lib/mgr/invoices-view";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { QboSyncView } from "./accounting";

/** Uses the shared coarse-pointer target height without turning navigation into a button. */
const DetailLink = ({ row }: { row: InvoiceListRow }) => (
  <Link href={row.href ?? "#"} data-to="Invoice" aria-label={`Open ${row.document.number}`} className="inline-flex min-h-6 items-center font-medium underline underline-offset-4 pointer-coarse:min-h-12">
    {row.document.number}
  </Link>
);

const FactValue = ({ children }: { children: ReactNode }) => <span className="whitespace-normal [overflow-wrap:anywhere]">{children}</span>;

function DueAndPayment({ row }: { row: InvoiceListRow }) {
  return <div>
    {E.fld("Due", <FactValue>{row.overdue ? <>{E.status("Overdue", "w")}{row.due.value}</> : row.due.value}</FactValue>)}
    {E.fld("Payment", <FactValue>{row.payment}</FactValue>)}
  </div>;
}

function MoneyFacts({ row }: { row: InvoiceListRow; }) {
  return <div>
    {E.fld(row.total.label, <FactValue>{row.total.value}</FactValue>)}
    {row.localSubtotal && E.fld(row.localSubtotal.label, <FactValue>{row.localSubtotal.value}</FactValue>)}
  </div>;
}

function Accounting({ row }: { row: InvoiceListRow }) {
  const detail = row.accounting ?? (row.needsMapping ? "Needs mapping" : "No accounting exception");
  return <div className="flex min-w-0 flex-col items-end gap-1">
    {row.needsMapping && E.status("Needs mapping", "w")}
    <FactValue>{detail}</FactValue>
    {row.quickbooksHref && E.act("Open in QuickBooks", "primary", row.quickbooksHref)}
  </div>;
}

function Register({ rows }: { rows: InvoiceListRow[] }) {
  return <>
    <div className="hidden md:block">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[10%] whitespace-normal">Document</TableHead>
            <TableHead className="w-[15%] whitespace-normal">Customer</TableHead>
            <TableHead className="w-[15%] whitespace-normal text-right">Total</TableHead>
            <TableHead className="w-[15%] whitespace-normal text-right">QuickBooks balance</TableHead>
            <TableHead className="w-[15%] whitespace-normal">Due / payment</TableHead>
            <TableHead className="w-[30%] whitespace-normal">Accounting</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.id} className="[&>td]:align-baseline">
            <TableCell className="whitespace-normal"><div className="flex flex-col gap-1"><DetailLink row={row} /><span className="text-muted-foreground text-xs">{row.document.kind === "credit_memo" ? "Credit memo" : "Invoice"}</span></div></TableCell>
            <TableCell className="whitespace-normal"><FactValue>{row.customer}</FactValue></TableCell>
            <TableCell className="whitespace-normal text-right"><MoneyFacts row={row} /></TableCell>
            <TableCell className="whitespace-normal text-right">{E.fld(row.balance.label, <FactValue>{row.balance.value}</FactValue>)}</TableCell>
            <TableCell className="whitespace-normal"><DueAndPayment row={row} /></TableCell>
            <TableCell className="whitespace-normal"><Accounting row={row} /></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
    <ItemGroup className="gap-0 md:hidden">
      {rows.map((row, index) => <Fragment key={row.id}>
        {index > 0 && <ItemSeparator className="my-0" />}
        <Item role="listitem" className="px-0">
          <ItemHeader><DetailLink row={row} /></ItemHeader>
          <ItemContent className="gap-0">
            {E.fld("Customer", <FactValue>{row.customer}</FactValue>)}
            <MoneyFacts row={row} />
            {E.fld(row.balance.label, <FactValue>{row.balance.value}</FactValue>)}
            <DueAndPayment row={row} />
            {E.fld("Accounting", <Accounting row={row} />)}
          </ItemContent>
        </Item>
      </Fragment>)}
    </ItemGroup>
  </>;
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
