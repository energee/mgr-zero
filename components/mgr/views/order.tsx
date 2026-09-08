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
}: {
  model: OrderViewModel;
  footer?: ReactNode;
  adjustLines?: boolean;
  showAddLine?: boolean;
  complianceNote?: string;
}) {
  return (
    <>
      {E.back("Orders", model.title, undefined, model.backHref)}
      {E.ttl(model.where)}
      {E.row("Current state", model.currentState, E.status(model.next))}
      {model.putBackHref ? E.act("Put back", "attention", model.putBackHref) : null}
      {model.confirmHref ? E.act("Review and confirm", "success", model.confirmHref) : null}
      {model.completeHref ? E.act("Complete transfer", "success", model.completeHref) : null}
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
      {footer !== undefined ? footer : E.btns([["Ship", "p"], ["Cancel order", "del"]])}
      {footer === undefined ? E.info("Cancel asks you to confirm. Allocations release.") : null}
    </>
  );
}
