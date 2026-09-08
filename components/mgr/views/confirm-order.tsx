// components/mgr/views/confirm-order.tsx — Confirm order drawing. Inventory
// and the live page both pass toConfirmOrderViewProps(get_order-shaped data).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ConfirmOrderViewModel } from "@/lib/mgr/confirm-order-view";

export type { ConfirmOrderViewModel };

export function ConfirmOrderView({
  model,
  footer,
  fulfillmentOptions,
  complianceNote,
}: {
  model: ConfirmOrderViewModel;
  footer?: ReactNode;
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
      {E.info(<>Lifecycle: submitted {E.arrow()} confirmed {E.arrow()} picked {E.arrow()} shipped {E.arrow()} delivered. Only the valid next action is active.</>)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, "", line.trailing, line.tone ?? "")}</Fragment>
      ))}
      {model.oversellNotes.map((note) => <Fragment key={note}>{E.note(note)}</Fragment>)}
      {complianceNote ? E.note(complianceNote) : null}
      {E.sp()}
      {footer ?? E.btns([["Confirm order", "p"], ["Cancel order", "del"]])}
    </>
  );
}
