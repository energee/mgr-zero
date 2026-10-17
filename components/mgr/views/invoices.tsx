// components/mgr/views/invoices.tsx — the staff Invoices register. A table from
// md up and an unboxed phone list below, both drawn from toInvoiceListRow; a
// 390px table would scroll. The number is each row's one link to detail, where
// every accounting action lives.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import { Item, ItemContent, ItemGroup, ItemHeader, ItemSeparator } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InvoiceListRow } from "@/lib/mgr/invoices-view";
import { HistoryNavigation, type HistoryNavigationProps } from "./history-navigation";
import { QboSyncView } from "./accounting";

/** At least 24px tall, so the link meets the WCAG 2.2 AA target size. */
const NumberLink = ({ row }: { row: InvoiceListRow }) => (
  <Link href={row.href ?? "#"} className="inline-flex min-h-6 items-center font-medium underline underline-offset-4">{row.number}</Link>
);

const Due = ({ row }: { row: InvoiceListRow }) => row.due && (
  <span className="inline-flex items-center gap-2">{row.overdue && E.status("Overdue", "w")}{row.due}</span>
);

const Status = ({ row }: { row: InvoiceListRow }) => (
  <span className="flex flex-col items-start gap-1">
    {row.needsMapping && E.status("Needs mapping", "w")}
    {row.status}
    {row.quickbooksHref && E.act("Open in QuickBooks", "primary", row.quickbooksHref)}
  </span>
);

const LocalSubtotal = ({ row }: { row: InvoiceListRow }) => row.localSubtotal && (
  <span className="block text-muted-foreground">Local subtotal {row.localSubtotal}</span>
);

function Register({ rows }: { rows: InvoiceListRow[] }) {
  return <>
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {/* Baseline, not middle: wrapped status text stays level with the number. */}
          {rows.map(row => <TableRow key={row.id} className="[&>td]:align-baseline">
            <TableCell><NumberLink row={row} /></TableCell>
            {/* shadcn cells never wrap; customer and status text must, not clip. */}
            <TableCell className="whitespace-normal">{row.customer}</TableCell>
            <TableCell><Due row={row} /></TableCell>
            <TableCell className="whitespace-normal"><Status row={row} /></TableCell>
            <TableCell className="text-right">{row.total}<LocalSubtotal row={row} /></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </div>
    <ItemGroup className="gap-0 md:hidden">
      {rows.map((row, i) => <Fragment key={row.id}>
        {i > 0 && <ItemSeparator className="my-0" />}
        <Item role="listitem" className="px-0">
          <ItemHeader><NumberLink row={row} /><span className="font-medium">{row.total}</span></ItemHeader>
          <ItemContent className="gap-0">
            <span className="text-muted-foreground">{row.customer}</span>
            <LocalSubtotal row={row} />
            {row.due && E.fld("Due", <Due row={row} />)}
            {E.fld("Status", <Status row={row} />)}
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
