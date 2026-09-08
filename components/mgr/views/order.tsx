// components/mgr/views/order.tsx — the Order screen drawing. Inventory and
// the live page both pass toOrderViewProps(get_order-shaped data). Sample
// orders live in lib/mgr/fixtures/orders.ts. Fixture verbs (Adjust, Add line,
// Ship, Cancel order) draw when those slots are omitted.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { OrderViewModel } from "@/lib/mgr/order-view";

export type { OrderViewModel };

export function OrderView({
  model,
  footer,
  adjustLines,
  showAddLine,
  complianceNote,
  orderId,
}: {
  model: OrderViewModel;
  footer?: ReactNode;
  adjustLines?: boolean;
  showAddLine?: boolean;
  complianceNote?: string;
  /** Live page only. The inventory frame omits it so verbs stay inert. */
  orderId?: string;
}) {
  const backHref = orderId ? "/orders" : undefined;
  const putBackHref = orderId && model.canPutBack ? `/orders/${orderId}/restock` : undefined;
  const confirmHref = orderId && model.canConfirm ? `/orders/${orderId}/confirm` : undefined;
  const completeHref = orderId && model.canComplete ? `/orders/${orderId}/complete` : undefined;
  return (
    <>
      {E.back("Orders", model.title, undefined, backHref)}
      {E.ttl(model.where)}
      {E.row("Current state", model.currentState, E.status(model.next))}
      {model.canPutBack ? E.act("Put back", "attention", putBackHref) : null}
      {model.canConfirm ? E.act("Review and confirm", "success", confirmHref) : null}
      {model.canComplete ? E.act("Complete transfer", "success", completeHref) : null}
      {model.fulfillmentSource ? E.fld("Fulfillment source", model.fulfillmentSource) : null}
      {model.shipTo ? E.fld("Ship-to", model.shipTo) : null}
      {model.customerPo ? E.fld("Customer PO", model.customerPo) : null}
      {model.requested ? E.fld("Requested", model.requested) : null}
      {model.note ? E.fld("Note", model.note) : null}
      {model.restockNote ? E.note(model.restockNote) : null}
      {model.lines.map((line) => (
        <Fragment key={line.key}>
          {E.row(line.name, line.detail, adjustLines ? E.act("Adjust", "attention") : "", line.tone ?? "")}
        </Fragment>
      ))}
      {showAddLine ? E.btn("Add line", "g") : null}
      {complianceNote ? E.note(complianceNote) : null}
      {model.events.length === 0 ? E.blank("No events yet") : E.tape(model.events)}
      {footer ?? E.btns([["Ship", "p"], ["Cancel order", "del"]])}
      {!footer ? E.info("Cancel asks you to confirm. Allocations release.") : null}
    </>
  );
}
