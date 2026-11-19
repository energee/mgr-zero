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

/** What the panel and the sheet both list. `onLine` runs when a line is tapped (the sheet closes first). */
function SummaryBody({ model, controls, locked, onLine }: Omit<SummaryProps, "disabled" | "preparing"> & { onLine?: () => void }) {
  const { summary } = model;
  return <div className="flex flex-col gap-1">
    {summary.lines.length ? <ul className="flex flex-col divide-y">
      {summary.lines.map(line => <li key={line.key}>
        <a href={`#${line.anchor}`} data-to="Shop" onClick={onLine} className="flex items-start justify-between gap-3 py-2 text-sm">
          <span className="min-w-0"><span className="block font-medium"><BrandedName name={line.name} alias={line.alias} /></span><span className="block text-xs text-muted-foreground">{line.detail}</span></span>
          <span className="shrink-0 tabular-nums">{line.amount}</span>
        </a>
      </li>)}
    </ul> : <p className="py-2 text-sm text-muted-foreground">Nothing in your order yet.</p>}
    {E.fld("Items subtotal", <span className="font-medium tabular-nums">{model.subtotal}</span>)}
    <p className="text-sm text-muted-foreground">{model.chargesLine}</p>
    <p className="text-xs text-muted-foreground">{model.depositInfo}</p>
    {E.row("Ships from", model.source)}
    <DeliveryDetails model={model} controls={controls} locked={locked} />
    {model.shipsFromNote ? E.note(model.shipsFromNote) : null}
    {summary.palletFit.length ? <div className="pt-2"><PalletFitBlock groups={summary.palletFit} /></div> : null}
  </div>;
}

/** The md+ panel: sticky beside the catalog, with the order's actions and messages. */
function OrderSummaryPanel({ model, controls, locked, disabled, preparing, messages }: SummaryProps & { messages?: ReactNode }) {
  return <aside aria-label="Your order" className="hidden self-start md:sticky md:top-0 md:block">
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-base font-semibold">Your order</h2>
      <SummaryBody model={model} controls={controls} locked={locked} />
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
      <SummaryBody model={model} controls={controls} locked={locked} onLine={() => setOpen(false)} />
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
