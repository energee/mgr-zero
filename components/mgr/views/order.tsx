// components/mgr/views/order.tsx — the Order screen drawing, read as a
// document (#976): header with the state and the next verbs, order details
// beside the price summary (stacked on the phone, summary before the lines),
// a line table on the desk and labeled line records on the phone, keg
// charges, cost, history, and a quiet Cancel at the bottom. Inventory and the
// live page both pass toOrderViewProps(get_order-shaped data); sample orders
// live in lib/mgr/fixtures/orders.ts. Verbs come in through `actions` and
// `footer`: fixtures pass inert E buttons, the live page its LifecycleButtons
// and CancelOrderAction (app/(app)/orders/[id]/lifecycle-buttons.tsx).
import type { ComponentProps, ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { PriceSummary } from "@/components/mgr/views/price-summary";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrderLineView, OrderViewModel } from "@/lib/mgr/order-view";
import { cn } from "@/lib/utils";

export type { OrderViewModel };

const H2 = "text-base font-semibold";
const LEGEND = "text-xs text-muted-foreground";
const NUMBER_COLUMNS = [["Ordered", "ordered"], ["Picked", "picked"], ["Shipped", "shipped"], ["Brewery ATP", "atp"], ["Unit price", "unitPrice"]] as const;

/** The quiet destructive Cancel order button; the live page makes it the CancelOrderDialog trigger. */
export const CancelOrderButton = (props: ComponentProps<typeof Button>) => (
  <Button variant="ghost" size="sm" type="button" className="-mr-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive" {...props}>Cancel order</Button>
);

/** The bottom row: why Cancel asks twice, beside the Cancel button (or the dialog opened from it). */
export function OrderCancelRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t pt-4">
      <p className={LEGEND}>Cancellation requires a reason and confirmation.</p>
      {children}
    </div>
  );
}

/** Short reason and warning, in words, under a line's name. */
function LineNotes({ line }: { line: OrderLineView }) {
  return (
    <>
      {line.shortReason ? <p className="text-xs text-muted-foreground">Short: {line.shortReason}</p> : null}
      {line.warning ? <div className="mt-1">{E.status(line.warning, "w")}</div> : null}
    </>
  );
}

export function OrderView({
  model,
  actions,
  footer,
  adjustLines,
  showAddLine,
  complianceNote,
}: {
  model: OrderViewModel;
  /** The state's verbs, primary first; drawn in the header. */
  actions?: ReactNode;
  /** The bottom row, normally an OrderCancelRow; omitted when the order cannot be cancelled. */
  footer?: ReactNode;
  adjustLines?: boolean;
  showAddLine?: boolean;
  complianceNote?: string;
}) {
  const headerVerbs = (
    <>
      {actions}
      {model.confirmHref ? E.btn("Review and confirm", "p", model.confirmHref) : null}
      {model.editHref ? E.btn("Edit draft", "g", model.editHref) : null}
    </>
  );
  return (
    <div className="flex flex-col gap-6 [overflow-wrap:anywhere]">
      <header className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          {E.back("Orders", <span className="flex flex-wrap items-center gap-2">{model.title}{E.status(model.currentState, model.stateTone)}</span>, undefined, model.backHref)}
          <p className="mt-1.5 text-base font-semibold">{model.customer}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {model.kind} · {model.next}
            {model.repickNote ? E.status("changed after pick", "w") : null}
          </p>
        </div>
        {/* Primary first in the source: it leads the phone row and ends the desk row. */}
        <div className="flex flex-wrap gap-2 *:w-auto! [&>*:first-child]:flex-1 md:flex-row-reverse md:pt-5 md:[&>*:first-child]:flex-none">
          {headerVerbs}
        </div>
      </header>

      {model.restockNote || model.repickNote || complianceNote ? (
        <div className="flex flex-col gap-2">
          {model.restockNote ? E.note(model.restockNote) : null}
          {model.putBackHref ? <div>{E.act("Put back", "attention", model.putBackHref)}</div> : null}
          {model.repickNote ? E.note(model.repickNote) : null}
          {complianceNote ? E.note(complianceNote) : null}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-8">
        <section aria-labelledby="order-details" className="min-w-0">
          <h2 id="order-details" className={H2}>Order details</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3.5">
            {model.facts.map((fact) => (
              <div key={fact.label} className={cn("min-w-0", fact.wide && "col-span-2")}>
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <PriceSummary model={model.summary} />
      </div>

      <section aria-labelledby="order-lines">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="order-lines" className={H2}>Ordered items</h2>
          <span className={LEGEND}>{model.lines.length} {model.lines.length === 1 ? "line" : "lines"}</span>
        </div>
        <div className="mt-2 hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0 text-xs">SKU</TableHead>
                {NUMBER_COLUMNS.map(([label]) => <TableHead key={label} className="text-right text-xs">{label}</TableHead>)}
                <TableHead className={cn("text-right text-xs", !adjustLines && "pr-0")}>Line amount</TableHead>
                {adjustLines ? <TableHead className="pr-0"><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="py-3.5 pl-0 whitespace-normal">
                    <span className="font-medium">{line.name}</span>
                    <LineNotes line={line} />
                  </TableCell>
                  {NUMBER_COLUMNS.map(([label, field]) => (
                    <TableCell key={label} className={cn("text-right tabular-nums", (line[field] === "Not supplied" || line[field] === "Not recorded") && "text-xs text-muted-foreground")}>{line[field]}</TableCell>
                  ))}
                  <TableCell className={cn("text-right font-semibold tabular-nums", !adjustLines && "pr-0")}>{line.amount}</TableCell>
                  {adjustLines ? <TableCell className="pr-0 text-right">{E.act("Adjust", "attention")}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="mt-1 divide-y md:hidden">
          {model.lines.map((line) => (
            <li key={line.key} className="py-4">
              <p className="text-sm font-semibold">{line.name}</p>
              <LineNotes line={line} />
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
                {([["Ordered", line.ordered], ["Brewery ATP", line.atp], ["Picked", line.picked], ["Shipped", line.shipped], ["Unit price", line.unitPrice], ["Line amount", line.amount]] as const).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {adjustLines ? <div className="mt-3">{E.act("Adjust", "attention")}</div> : null}
            </li>
          ))}
        </ul>
        <p className={cn(LEGEND, "mt-2")}>Brewery ATP is not stock at the fulfillment source. Missing ATP is not zero.</p>
        {showAddLine ? <div className="mt-3">{E.btn("Add line", "g")}</div> : null}
      </section>

      {model.kegCharges.length ? (
        <section aria-labelledby="order-keg-charges" className="border-t pt-5">
          <h2 id="order-keg-charges" className={H2}>Keg charges</h2>
          <ul className="mt-1 divide-y">
            {model.kegCharges.map((charge) => (
              <li key={charge.key} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{charge.name}</p>
                  <p className="text-xs text-muted-foreground">{charge.detail}</p>
                </div>
                <span className="shrink-0 tabular-nums">{charge.amount}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {model.costLine ? (
        <section aria-labelledby="order-cost" className="border-t pt-5">
          <h2 id="order-cost" className={H2}>Cost and margin</h2>
          {E.fld("Cost", model.costLine)}
        </section>
      ) : null}

      <section aria-labelledby="order-history" className="border-t pt-5">
        <h2 id="order-history" className={H2}>History</h2>
        {model.events.length === 0 ? <div className="mt-2">{E.blank("No events yet")}</div> : (
          <>
            <ol className="mt-2 flex flex-col gap-3">
              {model.events.map((event) => (
                <li key={event.key} className="grid gap-0.5 text-sm md:grid-cols-[11rem_minmax(0,1fr)] md:gap-4">
                  <span className="text-xs text-muted-foreground md:pt-0.5">{event.at}</span>
                  <span>{event.event}{event.detail ? <span className="text-muted-foreground"> · {event.detail}</span> : null}</span>
                </li>
              ))}
            </ol>
            <p className={cn(LEGEND, "mt-3")}>Times shown in brewery time · {model.timeZone}</p>
          </>
        )}
      </section>

      {footer}
    </div>
  );
}
