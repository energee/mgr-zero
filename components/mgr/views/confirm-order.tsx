// components/mgr/views/confirm-order.tsx — Confirm order drawing. Inventory
// and the live page both pass toConfirmOrderViewProps(get_order-shaped data).
// Lines sit under a brand heading, each named by its format, with its quantity
// in the shared number field (the live page edits it before confirming).
// Confirm order sits in the footer that sticks to the bottom of the phone's
// scroll; Cancel order is the order page's quiet trigger in the row below.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { startsGroup } from "@/lib/mgr/brand-lines";
import type { ConfirmOrderViewModel } from "@/lib/mgr/confirm-order-view";
import { OrderQuantity } from "./new-order";
import { BrewFooter } from "./brew-prep";
import { CancelOrderControl } from "./cancel-order";
import { CancelOrderButton, OrderCancelRow } from "./order";

export function ConfirmOrderView({
  model,
  footer,
  fulfillmentOptions,
  complianceNote,
  quantities,
  onQuantity,
  readOnly = false,
  reason,
  onReason,
}: {
  model: ConfirmOrderViewModel;
  footer?: ReactNode;
  /** Edited quantities by line key; a line not in it shows its ordered qty. */
  quantities?: Record<string, string>;
  onQuantity?: (key: string, value: string) => void;
  /** The order is already confirmed, so its quantities show but no longer edit. */
  readOnly?: boolean;
  /** Shown, and required, once a quantity is edited: adjust_order_lines records it. */
  reason?: string;
  onReason?: (value: string) => void;
  fulfillmentOptions?: string[];
  complianceNote?: string;
}) {
  return (
    <>
      {E.back("Orders", model.title, undefined, model.backHref)}
      {E.ttl(model.where)}
      {E.fld("State", model.state)}
      {fulfillmentOptions
        ? E.pick("Fulfillment source", model.fulfillmentSource ?? "", fulfillmentOptions)
        : model.fulfillmentSource ? E.fld("Fulfillment source", model.fulfillmentSource) : null}
      {model.lines.map((line, i) => (
        <Fragment key={line.key}>{startsGroup(model.lines, i) ? E.group(line.group) : null}{E.row(line.name, line.detail, <div className="w-32"><OrderQuantity label={`${line.group ? `${line.group} ` : ""}${line.name} quantity`} value={quantities?.[line.key] ?? line.qty} readOnly={readOnly} onChange={onQuantity && (value => onQuantity(line.key, value))} /></div>, line.tone ?? "")}</Fragment>
      ))}
      {model.shortageNote ? E.note(model.shortageNote) : null}
      {complianceNote ? E.note(complianceNote) : null}
      {onReason ? E.edit("Reason", reason ?? "", "text", undefined, { onChange: onReason, required: true }) : null}
      {E.sp()}
      {footer !== undefined ? footer : <>
        <BrewFooter>{E.btn("Confirm order")}</BrewFooter>
        <OrderCancelRow><CancelOrderControl trigger={<CancelOrderButton />} /></OrderCancelRow>
      </>}
    </>
  );
}
