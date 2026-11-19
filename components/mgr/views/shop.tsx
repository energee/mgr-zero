"use client";

import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { OrderQuantity } from "./new-order";
import { OrderSummary } from "./order-summary";
import { brandAnchor, type ShopViewModel } from "@/lib/mgr/shop-view";

export type ShopControls = {
  quantity?: (id: string, value: string) => void;
  /** Which offer a line orders from: "" for packaged stock, else a release id. */
  offer?: (id: string, value: string) => void;
  shipTo?: (id: string) => void; requestedDate?: (value: string) => void;
  po?: (value: string) => void; note?: (value: string) => void;
  saveDraft?: () => void; review?: () => void;
};

/** The catalog, with the order summary beside it from md up (a sticky panel)
 *  and pinned to its foot on a phone (a bar that opens a sheet). `footer={null}`
 *  draws the catalog alone. */
export function ShopView({ model, footer, comingUp, controls = {}, quantities, locked = false, disabled = false, preparing = false, messages }: {
  model: ShopViewModel; footer?: ReactNode; comingUp?: ReactNode;
  controls?: ShopControls; quantities?: Record<string, string>; locked?: boolean;
  disabled?: boolean; preparing?: boolean; messages?: ReactNode;
}) {
  // A focused quantity field means the phone keyboard is up: the bar steps aside.
  const [typing, setTyping] = useState(false);
  return <>
    {E.hd("Order")}
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        <fieldset disabled={locked} className="contents" onFocusCapture={event => setTyping(event.target instanceof HTMLInputElement)} onBlurCapture={() => setTyping(false)}>
          {model.empty ? E.blank(model.empty) : model.groups.map(group => <Fragment key={group.product}>
            {E.ttl(group.product, brandAnchor(group.product))}
            {group.alias ? <p className="-mt-1 text-xs text-muted-foreground">{group.alias}</p> : null}
            {/* Beside the price: a lone release reads as text (stock alone needs no words); several offers are an inline pick. */}
            {group.items.map(item => <Fragment key={item.key}>
              {E.row(item.name, item.offers.length > 1
                ? <>{item.price} · {E.pick(`${item.name} · order from`, item.offer, item.offers, { inline: true, onChange: controls.offer && (value => controls.offer?.(item.key, value)) })}</>
                : item.offers.length === 1 && item.offer ? `${item.price} · ${item.offers[0].label}` : item.price,
              <OrderQuantity label={item.name} value={quantities?.[item.key] ?? item.qty} step="1" onChange={controls.quantity && (value => controls.quantity?.(item.key, value))} />)}
            </Fragment>)}
          </Fragment>)}
        </fieldset>
        {comingUp !== undefined ? comingUp : E.nav("Coming up")}
      </div>
      {footer !== undefined ? footer : <OrderSummary model={model} controls={controls} locked={locked} disabled={disabled} preparing={preparing} messages={messages} typing={typing} />}
    </div>
  </>;
}
