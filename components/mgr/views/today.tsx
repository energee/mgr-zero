// components/mgr/views/today.tsx — Today and persona landings. Live maps
// get_today / taproomTodayRows onto rows with linkRows; inventory uses fixtures.
// The role's quick actions (model.actions) sit under the header, above the rows.
// The rows are a table, one line per entry at every width: the kind icon (its
// warning dot on the corner), the item, its customer, its state (with an Overdue
// badge when it is late), the detail cut short with an ellipsis rather than
// wrapped, and the verb at the trailing edge, in reach of a thumb. The desk
// heads the columns; a phone has no room for columns, so item, customer,
// Overdue and detail share one truncating cell there. The rows keep
// get_today's order, so the table does not sort.
import type { ReactNode } from "react";
import { BeerIcon, DeliveryTruck01Icon, Invoice01Icon, Package01Icon, Route01Icon, TaskDone01Icon, ThermometerIcon } from "@hugeicons/core-free-icons";
import { E, RowMedia } from "@/components/mgr/e";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TodayIcon, TodayRowView, TodayViewModel } from "@/lib/mgr/today-view";

const ICON: Record<TodayIcon, typeof Package01Icon> = {
  package: Package01Icon, truck: DeliveryTruck01Icon, route: Route01Icon,
  thermo: ThermometerIcon, beer: BeerIcon, task: TaskDone01Icon, invoice: Invoice01Icon,
};

export function TodayView({
  model,
  footer,
  emptyAction,
  linkRows,
}: {
  model: TodayViewModel;
  footer?: ReactNode;
  emptyAction?: ReactNode;
  linkRows?: boolean;
}) {
  const actions = model.actions ?? [];
  return (
    <>
      {E.hd("Today")}
      {/* A lone action spans the phone column, as E.btn does; two or more share a grid. */}
      {actions.length === 1 && E.btn(actions[0].label, "g", actions[0].href)}
      {actions.length > 1 && E.btns(actions.map((a) => [a.label, "g", a.href]))}
      {model.empty
        ? (
          <>
            {E.blank(model.empty)}
            {emptyAction !== undefined ? emptyAction : (model.emptyVerb ? E.btn(model.emptyVerb, "g") : null)}
          </>
        )
        : <TodayTable rows={model.rows} linkRows={linkRows} />}
      {footer}
    </>
  );
}

function TodayTable({ rows, linkRows }: { rows: TodayRowView[]; linkRows?: boolean }) {
  // Taproom rows name no customer or state, so their table has neither column.
  const customers = rows.some((row) => row.customer);
  const states = rows.some((row) => row.state);
  return (
    <Table>
      <TableHeader className="max-md:sr-only">
        <TableRow>
          <TableHead />
          <TableHead>Item</TableHead>
          {customers && <TableHead className="max-md:hidden">Customer</TableHead>}
          {states && <TableHead className="max-md:hidden">State</TableHead>}
          <TableHead className="max-md:hidden">Detail</TableHead>
          <TableHead><span className="sr-only">Action</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            {/* flex gives a lone warning dot (no icon) its size inside the cell. */}
            <TableCell className="w-8 pr-0"><span className="flex"><RowMedia icon={row.icon ? ICON[row.icon] : undefined} cls={row.warning ? "w" : ""} /></span></TableCell>
            {/* w-full with max-w-0: a cell takes what the row has left and truncates there. */}
            <TableCell className="w-full max-w-0 truncate md:w-auto md:max-w-sm" title={[row.title, row.customer, row.detail].filter(Boolean).join(" · ")}>
              <span className="font-medium">{row.title}</span>
              <span className="text-muted-foreground md:hidden">
                {row.customer && ` · ${row.customer}`}{row.overdue && <span className="text-warning-foreground"> · Overdue</span>} · {row.detail}
              </span>
            </TableCell>
            {customers && <TableCell className="whitespace-nowrap max-md:hidden">{row.customer}</TableCell>}
            {states && (
              <TableCell className="max-md:hidden">
                <span className="inline-flex gap-1.5">{row.state && E.status(row.state)}{row.overdue && E.status("Overdue", "w")}</span>
              </TableCell>
            )}
            <TableCell className="w-full max-w-0 truncate text-muted-foreground max-md:hidden" title={row.detail}>{row.detail}</TableCell>
            <TableCell className="text-right">
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
