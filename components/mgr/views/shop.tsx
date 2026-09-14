"use client";

import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm } from "@/components/mgr/command-form";
import { DatePicker } from "@/components/mgr/date-picker";
import { OrderQuantity } from "./new-order";
import { brandAnchor, type ShopViewModel } from "@/lib/mgr/shop-view";

export type { ShopViewModel };
export type ShopControls = {
  quantity?: (id: string, value: string) => void;
  shipTo?: (id: string) => void; requestedDate?: (value: string) => void;
  po?: (value: string) => void; note?: (value: string) => void;
  saveDraft?: () => void; review?: () => void;
};

export function ShopView({ model, footer, comingUp, controls = {}, quantities, locked = false, disabled = false, preparing = false, messages }: {
  model: ShopViewModel; footer?: ReactNode; comingUp?: ReactNode;
  controls?: ShopControls; quantities?: Record<string, string>; locked?: boolean;
  disabled?: boolean; preparing?: boolean; messages?: ReactNode;
}) {
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  return <>
    {E.hd("Order", model.customer)}
    <fieldset disabled={locked} className="contents">
      {model.empty ? E.blank(model.empty) : model.groups.map(group => <Fragment key={group.product}>
        {E.ttl(group.product, brandAnchor(group.product))}
        {group.items.map(item => <Fragment key={item.key}>
          {E.row(item.name, item.price, <OrderQuantity label={item.name} value={quantities?.[item.key] ?? item.qty} step="1" onChange={controls.quantity && (value => controls.quantity?.(item.key, value))} />)}
        </Fragment>)}
      </Fragment>)}
    </fieldset>
    {comingUp !== undefined ? comingUp : E.gated("Coming up", "The brewery’s upcoming releases aren’t available here yet.")}
    {footer !== undefined ? footer : <>
      {E.row("Ships from", model.source)}
      {E.row("Ship-to · requested date", model.shipToLine,
        <CommandForm title="Delivery details" open={deliveryOpen} onOpenChange={setDeliveryOpen}
          trigger={<Button type="button" variant="ghost" disabled={locked} aria-label="Change delivery details">Change</Button>}>
          <fieldset disabled={locked} className="flex flex-col gap-2">
            {E.pick("Ship to", model.shipToId, [{ value: "", label: "Select a ship-to" }, ...(model.shipTos.map(shipTo => ({ value: shipTo.id, label: shipTo.label })))], { onChange: controls.shipTo })}
            <DatePicker label="Requested date (optional)" value={controls.requestedDate ? model.requestedDate : undefined} defaultValue={model.requestedDate} onChange={controls.requestedDate} />
            {E.edit("PO number", model.po, "text", undefined, { onChange: controls.po })}
            {E.edit("Note", model.note, "text", undefined, { onChange: controls.note })}
            <Button type="button" onClick={() => setDeliveryOpen(false)}>Done</Button>
          </fieldset>
        </CommandForm>)}
      {E.fld("Current catalog subtotal", model.subtotal)}
      {messages}
      {E.sp()}
      {E.info(model.depositInfo)}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={controls.saveDraft}>Save draft</Button>
        <Button type="button" disabled={disabled} onClick={controls.review}>{preparing ? "Preparing review…" : model.reviewVerb}</Button>
      </div>
    </>}
  </>;
}
