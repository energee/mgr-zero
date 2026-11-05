// components/mgr/views/queue-table.tsx — the queue table Today and Work draw
// their rows through (docs/plans/rows-like-today.md): one line per entry at
// every width: the kind icon (its warning dot on the corner), the item, its
// customer, its state (with an Overdue badge when it is late), an order's ship
// day and amount, the detail cut short with an ellipsis rather than wrapped,
// and the verb at the trailing edge, in reach of a thumb. The desk heads the
// columns; a phone has no room for columns, so item, customer, Overdue, ship
// day, amount and detail share one truncating cell there. The rows keep their
// query's order, so the table does not sort. A live order row (linkRows and an
// orderId) opens the order sheet from anywhere on its line.
import { BeerIcon, DeliveryTruck01Icon, Invoice01Icon, Package01Icon, Route01Icon, TaskDone01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E, RowMedia } from "@/components/mgr/e";
import { SheetLink } from "@/components/mgr/order-sheet-link";
import { ORDER_SHEET_PARAM } from "@/lib/mgr/order-sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TodayIcon, TodayRowView } from "@/lib/mgr/today-view";

const ICON: Record<TodayIcon, typeof Package01Icon> = {
  package: Package01Icon, truck: DeliveryTruck01Icon, route: Route01Icon,
  thermo: ThermometerIcon, beer: BeerIcon, task: TaskDone01Icon, invoice: Invoice01Icon,
};

/** A queue row: Today's display fields, without the due instant it sorts by. */
export type QueueRow = Omit<TodayRowView, "dueAt">;

export function QueueTable({ rows, linkRows }: { rows: QueueRow[]; linkRows?: boolean }) {
  // A column is drawn only when some row fills it: taproom and Work rows name no
  // customer or state, and only Today's order rows have a ship day and an amount.
  const customers = rows.some((row) => row.customer);
  const states = rows.some((row) => row.state);
  const ships = rows.some((row) => row.ships);
  const amounts = rows.some((row) => row.amount);
  return (
    // Dense rows: half the stock cell padding and a shorter head, so the verb button (h-7) sets the row height.
    <Table className="[&_td]:py-1 [&_th]:h-8">
      <TableHeader className="max-md:sr-only">
        <TableRow>
          <TableHead />
          <TableHead>Item</TableHead>
          {customers && <TableHead className="max-md:hidden">Customer</TableHead>}
          {states && <TableHead className="max-md:hidden">State</TableHead>}
          {ships && <TableHead className="max-md:hidden">Ships</TableHead>}
          {amounts && <TableHead className="text-right max-md:hidden">Amount</TableHead>}
          <TableHead className="max-md:hidden">Detail</TableHead>
          <TableHead><span className="sr-only">Action</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className="relative">
            {/* flex gives a lone warning dot (no icon) its size inside the cell. */}
            <TableCell className="w-8 pr-0"><span className="flex"><RowMedia icon={row.icon ? ICON[row.icon] : undefined} cls={row.warning ? "w" : ""} /></span></TableCell>
            {/* w-full with max-w-0: a cell takes what the row has left and truncates there. */}
            <TableCell className="w-full max-w-0 truncate md:w-auto md:max-w-sm" title={[row.title, row.customer, row.ships, row.amount, row.detail].filter(Boolean).join(" · ")}>
              {/* A live order row opens the order sheet from anywhere on the line; the verb sits above that cover. */}
              {linkRows && row.orderId
                ? <SheetLink param={ORDER_SHEET_PARAM} id={row.orderId} className="font-medium after:absolute after:inset-0">{row.title}</SheetLink>
                : <span className="font-medium">{row.title}</span>}
              <span className="text-muted-foreground md:hidden">
                {row.customer && ` · ${row.customer}`}{row.overdue && <span className="text-warning-foreground"> · Overdue</span>}
                {[row.ships, row.amount, row.detail].filter(Boolean).map((part) => ` · ${part}`).join("")}
              </span>
            </TableCell>
            {customers && <TableCell className="whitespace-nowrap max-md:hidden">{row.customer}</TableCell>}
            {states && (
              <TableCell className="max-md:hidden">
                <span className="inline-flex gap-1.5">{row.state && E.status(row.state)}{row.overdue && E.status("Overdue", "w")}</span>
              </TableCell>
            )}
            {ships && <TableCell className="whitespace-nowrap max-md:hidden">{row.ships}</TableCell>}
            {amounts && <TableCell className="whitespace-nowrap text-right tabular-nums max-md:hidden">{row.amount}</TableCell>}
            <TableCell className="w-full max-w-0 truncate text-muted-foreground max-md:hidden" title={row.detail}>{row.detail}</TableCell>
            <TableCell className="relative z-10 text-right">
              {row.verb
                ? E.act(row.verb, row.tone ?? "primary", linkRows ? row.href : undefined)
                : row.trailing && <span className="text-muted-foreground">{row.trailing}</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
