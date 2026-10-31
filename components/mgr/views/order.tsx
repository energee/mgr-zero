// components/mgr/views/order.tsx — the Order screen drawing, read as a
// document (#976): header with the state and the next verbs, order details
// beside the price summary (stacked on the phone, summary before the lines),
// a line table on the desk and labeled line records on the phone, both with
// the model's columns (toOrderViewProps drops the empty ones, #1506), keg
// charges, cost, history, and a quiet Cancel at the bottom. Inventory and the
// live page both pass toOrderViewProps(get_order-shaped data); sample orders
// live in lib/mgr/fixtures/orders.ts. Verbs come in through `actions` and
// `footer`: fixtures pass inert E buttons and leave `footer` out (the shared
// Cancel order dialog simulates locally); the live page passes LifecycleButtons
// and CancelOrderAction (app/(app)/orders/[id]/lifecycle-buttons.tsx), and
// footer={null} draws no bottom row. With onQuantity, Ordered is the shared
// number field and, with onReason, a required Reason follows the lines;
// `lineActions` (Save lines, or the saved lines' ATP warnings) follows that.
// With `lineEdit`, each line has ✕ and Add line appends a line that picks its
// SKU: the live page adds, removes and adjusts lines in place
// (order-lines-form.tsx, #1503).
import type { ComponentProps, ReactNode } from "react";
import { OrderQuantity, OrderSkuPicker, PickupSwitch } from "./new-order";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { FactsGrid } from "@/components/mgr/views/facts-grid";
import { PriceSummary } from "@/components/mgr/views/price-summary";
import { CancelOrderControl } from "./cancel-order";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrderLineView, OrderViewModel } from "@/lib/mgr/order-view";
import { cn } from "@/lib/utils";

/** Adding and removing lines in place. An added line's quantity lives in OrderView's `quantities`, by its key. */
export type OrderLineEdit = {
  /** The SKUs an added line picks from. */
  skus: { id: string; label: string }[];
  /** Lines added here and not saved yet. */
  added: { key: string; skuId: string }[];
  onAdd?: () => void;
  onSku?: (key: string, skuId: string) => void;
  /** Removes a saved or added line by key; the caller drops a saved one from the model's lines. */
  onRemove?: (key: string) => void;
};

const H2 = "text-base font-semibold";
const LEGEND = "text-xs text-muted-foreground";

/** The quiet destructive Cancel order button; the live page makes it the CancelOrderDialog trigger. */
export const CancelOrderButton = (props: ComponentProps<typeof Button>) => (
  <Button variant="ghost" size="sm" type="button" data-preview-action className="-mr-2.5 text-destructive hover:bg-destructive/10 hover:text-destructive" {...props}>Cancel order</Button>
);

/** The bottom row: the Cancel button (or the dialog opened from it), at the end. Its dialog asks for the reason. */
export function OrderCancelRow({ children }: { children: ReactNode }) {
  return <div className="flex justify-end border-t pt-4">{children}</div>;
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
  lineEdit,
  complianceNote,
  quantities,
  onQuantity,
  reason,
  onReason,
  lineActions,
  pickup,
  onReorderRefused,
  reordering = false,
}: {
  model: OrderViewModel;
  /** The state's verbs, primary first; drawn in the header after Put back when beer is staged. */
  actions?: ReactNode;
  /** The bottom row. Omitted: the shared fixture cancellation dialog; null: none. */
  footer?: ReactNode;
  lineEdit?: OrderLineEdit;
  complianceNote?: string;
  /** Edited Ordered quantities by line key; a line not in it shows its ordered qty. */
  quantities?: Record<string, string>;
  onQuantity?: (key: string, value: string) => void;
  /** Shown, and required, with onReason: adjust_order_lines records it. */
  reason?: string;
  onReason?: (value: string) => void;
  /** Save lines and Discard changes, or the saved lines' ATP warnings, drawn under the lines (and Reason). */
  lineActions?: ReactNode;
  /** Present only when staff may change fulfillment before shipping; fixtures simulate the switch locally. */
  pickup?: { value: boolean; onChange?: (value: boolean) => void; busy?: boolean; error?: string | null };
  onReorderRefused?: () => void;
  reordering?: boolean;
}) {
  const orderedField = (line: { key: string; name: string; ordered?: string }) => onQuantity
    ? <div className="w-32 md:ml-auto"><OrderQuantity label={`${line.name} ordered`} value={quantities?.[line.key] ?? line.ordered ?? ""} onChange={(value) => onQuantity(line.key, value)} /></div>
    : line.ordered;
  const added = lineEdit?.added ?? [];
  const lineCount = model.lines.length + added.length;
  // The order keeps at least one line, so a lone line has no ✕.
  const remove = (key: string, name: string) => lineEdit && lineCount > 1
    ? <Button type="button" variant="ghost" size="sm" data-preview-action aria-label={`Remove ${name}`} title="Remove" onClick={() => lineEdit.onRemove?.(key)}>✕</Button>
    : null;
  const addedName = (index: number) => `Added line ${index + 1}`;
  const skuPicker = (line: { key: string; skuId: string }, index: number) =>
    <OrderSkuPicker label={`${addedName(index)} SKU`} value={line.skuId} options={lineEdit?.skus ?? []} onChange={lineEdit?.onSku && ((value) => lineEdit.onSku?.(line.key, value))} />;
  // Staged beer must go back before anything ships, so Put back leads (the
  // caller passes its fulfillment verbs as secondary then).
  const headerVerbs = (
    <>
      {model.putBackHref ? E.btn("Put back", "p", model.putBackHref) : null}
      {actions}
      {model.confirmHref ? E.btn("Review and confirm", "p", model.confirmHref) : null}
      {model.editHref ? E.btn("Edit draft", "g", model.editHref) : null}
      {model.canReorderRefused ? E.btn("Reorder refused beer", reordering ? "g disabled" : "g", undefined, onReorderRefused) : null}
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
        {/* Primary first, in both reading and tab order: it fills the phone row's width and leads the right-aligned desk row. */}
        <div className="flex flex-wrap gap-2 *:w-auto! [&>*:first-child]:flex-1 md:justify-end md:pt-5 md:[&>*:first-child]:flex-none">
          {headerVerbs}
        </div>
      </header>

      {model.restockNote || model.repickNote || complianceNote ? (
        <div className="flex flex-col gap-2">
          {model.restockNote ? E.note(model.restockNote) : null}
          {model.repickNote ? E.note(model.repickNote) : null}
          {complianceNote ? E.note(complianceNote) : null}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:gap-8">
        <section aria-labelledby="order-details" className="min-w-0">
          <h2 id="order-details" className={H2}>Order details</h2>
          <FactsGrid facts={model.facts} />
          {pickup ? (
            <div className="mt-4">
              <PickupSwitch on={pickup.value} onChange={pickup.onChange} disabled={pickup.busy} />
              <CommandFormMessage error={pickup.error} />
            </div>
          ) : null}
        </section>
        <PriceSummary model={model.summary} />
      </div>

      <section aria-labelledby="order-lines">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="order-lines" className={H2}>Ordered items</h2>
          <span className={LEGEND}>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
        </div>
        <div className="mt-2 hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-0 text-xs">SKU</TableHead>
                {model.columns.map(([label]) => <TableHead key={label} className="text-right text-xs">{label}</TableHead>)}
                <TableHead className={cn("text-right text-xs", !lineEdit && "pr-0")}>Line amount</TableHead>
                {lineEdit ? <TableHead className="pr-0"><span className="sr-only">Remove</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="py-3.5 pl-0 whitespace-normal">
                    <span className="font-medium">{line.name}</span>
                    <LineNotes line={line} />
                  </TableCell>
                  {model.columns.map(([label, field]) => (
                    <TableCell key={label} className={cn("text-right tabular-nums", (line[field] === "Not supplied" || line[field] === "Not recorded") && "text-xs text-muted-foreground")}>{field === "ordered" ? orderedField(line) : line[field]}</TableCell>
                  ))}
                  <TableCell className={cn("text-right font-semibold tabular-nums", !lineEdit && "pr-0")}>{line.amount}</TableCell>
                  {lineEdit ? <TableCell className="pr-0 text-right">{remove(line.key, line.name)}</TableCell> : null}
                </TableRow>
              ))}
              {added.map((line, index) => (
                <TableRow key={line.key}>
                  <TableCell className="py-3.5 pl-0 whitespace-normal">{skuPicker(line, index)}</TableCell>
                  {model.columns.map(([label, field]) => (
                    <TableCell key={label} className="text-right tabular-nums">{field === "ordered" ? orderedField({ key: line.key, name: addedName(index) }) : null}</TableCell>
                  ))}
                  <TableCell />
                  <TableCell className="pr-0 text-right">{remove(line.key, addedName(index))}</TableCell>
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
                {[...model.columns, ["Line amount", "amount"] as const].map(([label, field]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">{field === "ordered" ? orderedField(line) : line[field]}</dd>
                  </div>
                ))}
              </dl>
              {lineEdit && lineCount > 1 ? <div className="mt-3 flex justify-end">{remove(line.key, line.name)}</div> : null}
            </li>
          ))}
          {added.map((line, index) => (
            <li key={line.key} className="flex flex-col gap-3 py-4">
              {skuPicker(line, index)}
              <div className="flex items-center justify-between gap-3">{orderedField({ key: line.key, name: addedName(index) })}{remove(line.key, addedName(index))}</div>
            </li>
          ))}
        </ul>
        {lineEdit ? <Button type="button" variant="ghost" className="mt-3 w-fit" data-preview-action onClick={lineEdit.onAdd}>Add line</Button> : null}
        {onReason || lineActions ? <div className="mt-3 flex flex-col gap-2">{onReason ? E.edit("Reason", reason ?? "", "text", undefined, { onChange: onReason, required: true }) : null}{lineActions}</div> : null}
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
                  <span>{event.event}{event.by ? ` by ${event.by}` : null}{event.detail ? <span className="text-muted-foreground"> · {event.detail}</span> : null}</span>
                </li>
              ))}
            </ol>
            <p className={cn(LEGEND, "mt-3")}>Times shown in brewery time · {model.timeZone}</p>
          </>
        )}
      </section>

      {footer === undefined ? <OrderCancelRow><CancelOrderControl trigger={<CancelOrderButton />} /></OrderCancelRow> : footer}
    </div>
  );
}
