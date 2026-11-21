// components/mgr/views/order-summary.tsx — the portal Shop's order summary,
// always in view. From md up it is a sticky "Your order" panel beside the
// catalog; on a phone it is a bar pinned to the foot of the scroll, just above
// the tab bar, that opens the same summary in a bottom sheet. Both draw one
// ShopViewModel (lib/mgr/shop-view.ts), so their numbers cannot differ.
"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { E } from "@/components/mgr/e";
import { Icon } from "@/components/mgr/icon";
import { Button } from "@/components/ui/button";
import { CommandForm } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import { PalletFitBlock } from "./pallet-fit";
import { BrandedName } from "./branded-name";
import type { ShopViewModel } from "@/lib/mgr/shop-view";
import type { ShopControls } from "./shop";

type SummaryProps = { model: ShopViewModel; controls: ShopControls; locked: boolean; disabled: boolean; preparing: boolean };

function ReviewButton({ disabled, preparing, onClick, className }: { disabled: boolean; preparing: boolean; onClick?: () => void; className?: string }) {
  return <Button type="button" className={className} disabled={disabled} onClick={onClick}>{preparing ? "Preparing review…" : <>Review order<Icon icon={ArrowRight02Icon} data-icon="inline-end" /></>}</Button>;
}

/** Ship-to, requested date, PO and note, edited in their own small form. */
function DeliveryDetails({ model, controls, locked }: Omit<SummaryProps, "disabled" | "preparing">) {
  const [open, setOpen] = useState(false);
  return E.row("Ship-to · requested date", model.shipToLine,
    <CommandForm title="Delivery details" open={open} onOpenChange={setOpen}
      trigger={<Button type="button" variant="ghost" disabled={locked} aria-label="Change delivery details">Change</Button>}>
      <fieldset disabled={locked} className="flex flex-col gap-2">
        {E.pick("Ship to", model.shipToId, [{ value: "", label: "Select a ship-to", disabled: true }, ...(model.shipTos.map(shipTo => ({ value: shipTo.id, label: shipTo.label })))], { onChange: controls.shipTo })}
        <DatePicker label="Requested date (optional)" value={controls.requestedDate ? model.requestedDate : undefined} defaultValue={model.requestedDate} onChange={controls.requestedDate} />
        {E.edit("PO number", model.po, "text", undefined, { onChange: controls.po })}
        {E.edit("Note", model.note, "text", undefined, { onChange: controls.note })}
        <Button type="button" onClick={() => setOpen(false)}>Done</Button>
      </fieldset>
    </CommandForm>);
}

/** The cart as the orders it becomes, each under its ship date: a brand once with its packages under it, then
 *  that order's pallets and layers. An order holding more than one week's beer lists each week apart with its own subtotal.
 *  Every line has a remove button, undone from the note it leaves; `steppers` (the md+ panel) adds − and + around the quantity. `onLine` runs when a brand is tapped (the sheet closes first). */
function SummaryLines({ model, controls, locked, onLine, steppers }: Omit<SummaryProps, "disabled" | "preparing"> & { onLine?: () => void; steppers?: boolean }) {
  const { summary } = model;
  // The last line removed here, offered back until it is in the cart again.
  const [removed, setRemoved] = useState<{ key: string; name: string; qty: number } | null>(null);
  const undo = removed && !summary.lines.some(line => line.key === removed.key) ? removed : null;
  const tap = { type: "button", variant: "ghost", size: "icon", className: "size-7 shrink-0", disabled: locked, "data-preview-action": true } as const;
  const split = summary.shipments.length > 1;
  return <>{undo ? <p role="status" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">Removed {undo.name}<Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => controls.quantity?.(undo.key, String(undo.qty))}>Undo</Button></p> : null}{!summary.lines.length ? <p className="py-2 text-sm text-muted-foreground">Nothing in your order yet.</p> : summary.shipments.map(shipment => <section key={shipment.key} aria-label={shipment.title} data-shipment={shipment.key} className="flex flex-col">
    <h3 className="flex justify-between gap-3 pt-2 text-sm font-semibold"><span>{shipment.title}</span>{split && shipment.parts.length === 1 ? <span className="tabular-nums">{shipment.subtotal}</span> : null}</h3>
    {shipment.parts.map(({ from, title, subtotal, lines, shipWith }) => <div key={from} className="flex flex-col">
    {shipment.parts.length > 1 ? <h4 className="flex justify-between gap-3 pt-2 text-sm font-medium"><span>{title}</span><span className="tabular-nums">{subtotal}</span></h4> : null}
    {shipWith ? <fieldset disabled={locked}>{E.pick(shipWith.label, shipWith.value, shipWith.options, { onChange: date => controls.shipWith?.(from, date) })}</fieldset> : null}
    <ul className="flex flex-col divide-y">
      {[...Map.groupBy(lines, line => line.anchor)].map(([anchor, lines]) => <li key={anchor} className="flex flex-col gap-0.5 py-2 text-sm">
        <a href={`#${anchor}`} data-to="Shop" onClick={onLine} className="font-medium"><BrandedName name={lines[0].brand} alias={lines[0].alias} /></a>
        {lines.map(line => <span key={line.key} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">{line.pack} · {steppers ? line.each : line.detail}</span>
          {/* ponytail: − and + only; typing a quantity stays in the catalog, since a line cleared to retype would vanish at 0. */}
          {steppers ? <span className="flex shrink-0 items-center rounded-lg bg-muted text-foreground">
            <Button {...tap} aria-label={`Decrease ${line.brand} ${line.pack}`} onClick={() => controls.quantity?.(line.key, String(line.qty - 1))}>−</Button>
            <span className="min-w-6 text-center text-sm tabular-nums">{line.qty}</span>
            <Button {...tap} aria-label={`Increase ${line.brand} ${line.pack}`} onClick={() => controls.quantity?.(line.key, String(line.qty + 1))}>+</Button>
          </span> : null}
          <span className="shrink-0 text-sm tabular-nums text-foreground">{line.amount}</span>
          <Button {...tap} aria-label={`Remove ${line.brand} ${line.pack}`} onClick={() => { setRemoved({ key: line.key, name: `${line.brand} ${line.pack}`, qty: line.qty }); controls.quantity?.(line.key, "0"); }}>×</Button>
        </span>)}
      </li>)}
    </ul>
    </div>)}
    {shipment.pallet ? <p className="pb-2 text-sm">{shipment.pallet}</p> : null}
    {shipment.palletFit.length ? <div className="pb-2"><PalletFitBlock groups={shipment.palletFit} /></div> : null}
  </section>)}</>;
}

/** The fine print under the lines: what Review adds, and where the order ships from. */
function SummaryNotes({ model }: { model: ShopViewModel }) {
  return <>
    <p className="text-sm text-muted-foreground">{model.chargesLine}</p>
    <p className="text-xs text-muted-foreground">{model.depositInfo}</p>
    {E.row("Ships from", model.source)}
    {model.shipsFromNote ? E.note(model.shipsFromNote) : null}
  </>;
}

const subtotal = (model: ShopViewModel) => E.fld("Items subtotal", <span className="font-medium tabular-nums">{model.subtotal}</span>);

/** The md+ panel: sticky beside the catalog and short enough to fit the window under the page heading. The lines and fine print
 *  scroll; the subtotal, delivery details, messages and the order's actions stay in view under them. */
function OrderSummaryPanel({ model, controls, locked, disabled, preparing, messages }: SummaryProps & { messages?: ReactNode }) {
  return <aside aria-label="Your order" className="hidden self-start md:sticky md:top-0 md:block">
    <div className="flex max-h-[calc(100dvh-8rem)] flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-base font-semibold">Your order</h2>
      <div className="-mr-2 flex min-h-0 flex-col gap-1 overflow-y-auto pr-2">
        <SummaryLines model={model} controls={controls} locked={locked} steppers />
        <SummaryNotes model={model} />
      </div>
      <div className="flex flex-col gap-1">
        {subtotal(model)}
        <DeliveryDetails model={model} controls={controls} locked={locked} />
      </div>
      {messages}
      <ReviewButton className="w-full" disabled={disabled} preparing={preparing} onClick={controls.review} />
      <Button type="button" variant="ghost" className="w-full" disabled={disabled} onClick={controls.saveDraft}>Save draft</Button>
    </div>
  </aside>;
}

/** The phone bar: items and total (announced politely), the ship date and a
 *  pallet hint when there is one, and Review. Tapping the totals opens the
 *  summary sheet. Hidden with an empty cart and while a quantity is typed. */
function OrderSummaryBar({ model, controls, locked, disabled, preparing, typing }: SummaryProps & { typing: boolean }) {
  const [open, setOpen] = useState(false);
  const { summary } = model;
  if (!summary.lines.length || typing) return null;
  const facts = [summary.shipsOn, summary.palletHint].filter(Boolean).join(" · ");
  const review = () => { setOpen(false); controls.review?.(); };
  return <section aria-label="Order summary" className="sticky -bottom-4 z-10 -mx-4 flex items-center gap-3 border-t bg-background px-4 py-2 md:hidden">
    <CommandForm title="Your order" open={open} onOpenChange={setOpen}
      trigger={<button type="button" data-preview-action className="flex min-h-12 min-w-0 flex-1 flex-col justify-center text-left" aria-label={`Show your order: ${summary.items}, ${model.subtotal}`}>
        <span aria-live="polite" className="text-sm font-medium tabular-nums">{`${summary.items} · ${model.subtotal}`}</span>
        {facts ? <span className="truncate text-xs text-muted-foreground">{facts}</span> : null}
      </button>}
      footer={<div className="flex flex-col gap-2 pb-2">
        <ReviewButton className="w-full" disabled={disabled} preparing={preparing} onClick={review} />
        <Button type="button" variant="ghost" className="w-full" disabled={disabled} onClick={() => { setOpen(false); controls.saveDraft?.(); }}>Save draft</Button>
      </div>}>
      <div className="flex flex-col gap-1">
        <SummaryLines model={model} controls={controls} locked={locked} onLine={() => setOpen(false)} />
        {subtotal(model)}
        <SummaryNotes model={model} />
        <DeliveryDetails model={model} controls={controls} locked={locked} />
      </div>
    </CommandForm>
    <ReviewButton className="shrink-0" disabled={disabled} preparing={preparing} onClick={review} />
  </section>;
}

/** Both forms of the summary, placed after the catalog: in Shop's md+ grid the
 *  panel takes the second column (the phone parts are display:none there); on a
 *  phone the panel is hidden and the messages and the sticky bar follow the catalog. */
export function OrderSummary({ messages, typing, ...props }: SummaryProps & { messages?: ReactNode; typing: boolean }) {
  return <>
    <OrderSummaryPanel {...props} messages={messages} />
    {messages ? <div className="flex flex-col gap-3 md:hidden">{messages}</div> : null}
    <OrderSummaryBar {...props} typing={typing} />
  </>;
}
