"use client";

import { Fragment, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { OrderQuantity } from "./new-order";
import { OrderSummary } from "./order-summary";
import { BrandHeading } from "./brand-heading";
import { brandAnchor, type ShopGroupView, type ShopViewModel } from "@/lib/mgr/shop-view";

export type ShopControls = {
  quantity?: (id: string, value: string) => void;
  /** Which offer a line orders from: "" for packaged stock, else a release id. */
  offer?: (id: string, value: string) => void;
  shipTo?: (id: string) => void; requestedDate?: (value: string) => void;
  po?: (value: string) => void; note?: (value: string) => void;
  saveDraft?: () => void; review?: () => void;
  /** Fills in the buyer's usual quantities for the pre-orders shipping on one date. */
  suggest?: (shipsFrom: string) => void;
  /** Tops up one ship date's order until its pallets are full. */
  fill?: (shipsFrom: string) => void;
  /** Which order the stock lines ship with: "" for now, else a pre-order ship date in the cart. */
  shipWith?: (shipsFrom: string) => void;
};

/** The catalog, with the order summary beside it from md up (a sticky panel)
 *  and pinned to its foot on a phone (a bar that opens a sheet). `footer={null}`
 *  draws the catalog alone. Each brand is one band: its label, large, with its
 *  name and facts under it on the left, and its packages with their quantity
 *  controls on the right (stacked on a phone). Order lists what can ship now; the Pre-order
 *  page lists the packages released from a planned batch, then planned beers
 *  not open yet. Both pages fill the same order. */
export function ShopView({ model, footer, controls = {}, quantities, locked = false, disabled = false, preparing = false, messages, brandHeading, section }: {
  model: ShopViewModel; footer?: ReactNode;
  /** Which page this is: absent draws Order (what can ship now); "pre-order" draws the Pre-order page (packages released from a planned batch, then planned beers not open yet). Both show the one order summary. */
  section?: "pre-order";
  /** The live Shop's brand heading: BrandHeading with the label and reference sheet. Absent draws the plain BrandHeading. `anchor` is the heading's id; `order` is the brand's package rows, for ordering from its sheet. */
  brandHeading?: (group: ShopGroupView, view: { anchor?: string; order: ReactNode }) => ReactNode;
  controls?: ShopControls; quantities?: Record<string, string>; locked?: boolean;
  disabled?: boolean; preparing?: boolean; messages?: ReactNode;
}) {
  // A focused quantity field means the phone keyboard is up: the bar steps aside.
  const [typing, setTyping] = useState(false);
  /** A brand's packages, each with its price and quantity, then the brand's amount in the order. Drawn under the heading and again in the brand's sheet. */
  const rows = (group: ShopGroupView) => <div className="flex min-w-0 flex-col">
    {/* Several offers are an inline pick beside the price. A lone release reads as its own line under the row, so its dates are never cut short; stock alone needs no words. */}
    {group.items.map(item => <Fragment key={item.key}>
      {E.row(item.name, item.offers.length > 1
        ? <>{item.price} · {E.pick(`${item.name} · order from`, item.offer, item.offers, { inline: true, onChange: controls.offer && (value => controls.offer?.(item.skuId, value)) })}</>
        : item.price,
      <OrderQuantity label={item.name} value={item.active ? quantities?.[item.skuId] ?? item.qty : 0} step="1" onChange={controls.quantity && (value => {
        // A cart holds one offer per SKU: a quantity typed in the other page's row moves the SKU to this row's offer.
        if (!item.active) controls.offer?.(item.skuId, item.offer);
        controls.quantity?.(item.skuId, value);
      })} />, "", undefined, item.offers.length === 1 && item.offer ? <p className="text-sm text-muted-foreground">{item.offers[0].label}</p> : undefined)}
    </Fragment>)}
    {group.limit ? <p className="mt-1 text-sm text-muted-foreground">{group.limit}</p> : null}
    {group.total ? <p className="mt-1 text-sm font-medium">In your order · {group.total}</p> : null}
  </div>;
  /** A page's brands, one band each. Pre-order brands are listed by ship date, each date heading the brands that ship on it. */
  const brands = (groups: ShopGroupView[]) => <div className="flex flex-col">{groups.map((group, index) => {
    const anchor = brandAnchor(group.product);
    return <Fragment key={group.product}>
      {/* Each ship date is its own order, so each has its own suggestion to take or leave. */}
      {group.ships && group.ships !== groups[index - 1]?.ships ? <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        {E.group(group.ships)}
        <span className="flex flex-wrap gap-x-2">
          {group.shipsFrom && model.preOrder?.suggested.includes(group.shipsFrom) ? E.btn("Use suggested quantities", "g", undefined, controls.suggest && (() => controls.suggest?.(group.shipsFrom!))) : null}
          {group.shipsFrom && model.preOrder?.fillable.includes(group.shipsFrom) ? E.btn("Fill the pallet", "g", undefined, controls.fill && (() => controls.fill?.(group.shipsFrom!))) : null}
        </span>
      </div> : null}
      <section className="grid gap-x-6 gap-y-2 border-t py-4 first:border-t-0 first:pt-0 @lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @lg:items-start">
      {brandHeading ? brandHeading(group, { anchor, order: <fieldset disabled={locked} className="contents">{rows(group)}</fieldset> }) : <BrandHeading name={group.product} alias={group.alias} facts={group.facts} anchor={anchor} card />}
      {rows(group)}
      </section>
    </Fragment>;
  })}</div>;
  let body: ReactNode;
  if (section === "pre-order") body = model.preOrder ? <>
    {E.polite("Beer the brewery has planned and opened for ordering ahead. Each ship date becomes its own order, and the brewery confirms each pre-order.")}
    {model.preOrder.note ? <p className="text-sm text-muted-foreground">{model.preOrder.note}</p> : null}
    {model.preOrder.suggestedNote ? <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Suggested quantities.</span> {model.preOrder.suggestedNote}</p> : null}
    {brands(model.preOrder.groups)}
    {model.preOrder.planned.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail)}</Fragment>)}
  </> : E.blank({ title: "Nothing open for pre-order yet" });
  else if (model.empty) body = E.blank(model.empty);
  else body = model.groups.length ? brands(model.groups) : E.blank({ title: "Nothing available to ship now" });
  return <>
    {E.hd(section === "pre-order" ? "Pre-order" : "Order")}
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
      <div className="@container flex min-w-0 flex-col gap-3">
        <fieldset disabled={locked} className="contents" onFocusCapture={event => setTyping(event.target instanceof HTMLInputElement)} onBlurCapture={() => setTyping(false)}>
          {body}
        </fieldset>
      </div>
      {footer !== undefined ? footer : <OrderSummary model={model} controls={controls} locked={locked} disabled={disabled} preparing={preparing} messages={messages} typing={typing} />}
    </div>
  </>;
}
