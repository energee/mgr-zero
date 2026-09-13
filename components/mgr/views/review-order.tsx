// Shared quote review; Cart owns submission and invalidates quotes on edits.
"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { OrderQuantity } from "./new-order";
import type { ReviewOrderViewModel } from "@/lib/mgr/review-order-view";

export type { ReviewOrderViewModel };

export function ReviewOrderView({ model, onQuantity, onBack, onPlace, messages, locked = false, disabled = false, submitting = false, footer }: {
  model: ReviewOrderViewModel; onQuantity?: (id: string, value: string) => void;
  onBack?: () => void; onPlace?: () => void; messages?: ReactNode;
  locked?: boolean; disabled?: boolean; submitting?: boolean; footer?: ReactNode;
}) {
  return (
    <>
      <fieldset disabled={locked} className="contents">{model.lines.map((line) => (
        <Fragment key={line.key}>
          {E.row(line.name, line.price, <OrderQuantity label={line.qtyLabel} value={line.qty} step="1" onChange={onQuantity && (value => onQuantity(line.key, value))} />)}
        </Fragment>
      ))}</fieldset>
      {model.deposits?.map(deposit => <Fragment key={deposit.key}>{E.fld(deposit.name, `${deposit.detail} · ${deposit.amount}`)}</Fragment>)}
      {model.depositDetail && model.depositAmount
        ? E.row("Keg deposit", model.depositDetail, model.depositAmount)
        : null}
      {E.fld("Subtotal", model.subtotal)}
      {E.fld("Tax", model.tax)}
      {model.estimatedTotal && E.fld("Estimated total", model.estimatedTotal)}
      {E.fld("Ship-to", model.shipTo)}
      {E.fld("Requested date", model.requestedDate)}
      {E.row("Ships from", model.source)}
      {E.fld("Your PO number", model.po)}
      {model.note && E.fld("Note", model.note)}
      {E.info(model.info)}
      {messages}
      {E.sp()}
      {footer !== undefined ? footer : <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={submitting} onClick={onBack}>Back to edit</Button>
        <Button type="button" className="h-auto whitespace-normal py-2" disabled={disabled} onClick={onPlace}>{submitting ? "Placing order…" : model.placeVerb}</Button>
      </div>}
    </>
  );
}
