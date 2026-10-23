// components/mgr/views/confirm-order.tsx — Confirm order drawing. Inventory
// and the live page both pass toConfirmOrderViewProps(get_order-shaped data).
// Lines sit under a brand heading, each named by its format, with its quantity
// in the shared number field (the live page edits it before confirming).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { startsGroup } from "@/lib/mgr/brand-lines";
import type { ConfirmOrderViewModel } from "@/lib/mgr/confirm-order-view";
import { OrderQuantity } from "./new-order";

export type { ConfirmOrderViewModel };

export function ConfirmOrderView({
  model,
  footer,
  fulfillmentOptions,
  complianceNote,
  quantities,
  onQuantity,
  reason,
  onReason,
}: {
  model: ConfirmOrderViewModel;
  footer?: ReactNode;
  /** Edited quantities by line key; a line not in it shows its ordered qty. */
  quantities?: Record<string, string>;
  onQuantity?: (key: string, value: string) => void;
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
        <Fragment key={line.key}>{startsGroup(model.lines, i) ? E.group(line.group) : null}{E.row(line.name, line.detail, <div className="w-32"><OrderQuantity label={`${line.group ? `${line.group} ` : ""}${line.name} quantity`} value={quantities?.[line.key] ?? line.qty} onChange={onQuantity && (value => onQuantity(line.key, value))} /></div>, line.tone ?? "")}</Fragment>
      ))}
      {model.shortageNote ? E.note(model.shortageNote) : null}
      {complianceNote ? E.note(complianceNote) : null}
      {onReason ? E.edit("Reason", reason ?? "", "text", undefined, { onChange: onReason, required: true }) : null}
      {E.sp()}
      {footer !== undefined ? footer : E.btns([["Confirm order", "p"], ["Cancel order", "del"]])}
    </>
  );
}
