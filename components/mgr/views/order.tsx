// components/mgr/views/order.tsx — the Order screen drawing. The inventory
// record mounts this with ORDER_PICKED_RESTOCK; the live page mounts it with
// toOrderViewProps(get_order). Verbs the explorer must tap (Adjust, Add line,
// Ship, Cancel order) are drawn here; live lifecycle forms replace the footer.
// How to convert the rest: .agents/superpowers/plans/2026-09-08-screen-views.md
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { OrderViewModel } from "@/lib/mgr/order-view";

export type { OrderViewModel };

/** The inventory's exemplar: picked, restock pending, Ohio registration note. */
export const ORDER_PICKED_RESTOCK: OrderViewModel = {
  title: "ORD-0229",
  where: "Al’s Bar · Columbus, OH",
  currentState: "Picked · restock pending",
  next: "Next: ship",
  fulfillmentSource: "Warehouse",
  customerPo: "4471",
  restockNote: "Put back 3 Pils cases to Warehouse. They stayed staged after the line was adjusted.",
  complianceNote: "Stout isn’t registered for Ohio. Check the Compliance registry.",
  adjustLines: true,
  showAddLine: true,
  showShipCancel: true,
  footerInfo: "Cancel asks you to confirm. Allocations release.",
  lines: [
    { key: "hazy", name: "Hazy IPA · ½ bbl keg", detail: "ordered 4 · picked 4 · ATP 11", tone: "ok" },
    { key: "pils", name: "Pils · 16 oz case", detail: "ordered 7 · picked 10", tone: "w" },
    { key: "stout", name: "Stout · ⅙ bbl keg", detail: "ordered 2 · picked 2 · ATP 7", tone: "ok" },
  ],
  events: [
    ["created · Ted", "Mon 9:02"],
    ["submitted · Ted", "Mon 9:05"],
    ["confirmed · Maria", "Mon 14:10"],
    ["picked · Dave · 4 / 10 / 2", "Tue 8:40"],
    [<>line adjusted · Pils 10 {E.arrow()} 7 · customer cut</>, "Tue 9:15"],
    ["restock pending · 3 Pils staged", "Tue 9:15"],
  ],
};

export function OrderView({ model, footer }: { model: OrderViewModel; footer?: ReactNode }) {
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
          {E.row(line.name, line.detail, model.adjustLines ? E.act("Adjust", "attention") : "", line.tone ?? "")}
        </Fragment>
      ))}
      {model.showAddLine ? E.btn("Add line", "g") : null}
      {model.complianceNote ? E.note(model.complianceNote) : null}
      {model.events.length === 0 ? E.blank("No events yet") : E.tape(model.events)}
      {footer ?? (model.showShipCancel ? E.btns([["Ship", "p"], ["Cancel order", "del"]]) : null)}
      {model.footerInfo ? E.info(model.footerInfo) : null}
    </>
  );
}
