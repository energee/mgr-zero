// components/mgr/views/confirm-order.tsx — Confirm order drawing. Inventory
// mounts CONFIRM_ORDER_EXEMPLAR; the live page maps get_order and slots
// ConfirmButtons as the footer.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ConfirmOrderViewModel } from "@/lib/mgr/confirm-order-view";

export type { ConfirmOrderViewModel };

export const CONFIRM_ORDER_EXEMPLAR: ConfirmOrderViewModel = {
  title: "ORD-0231",
  where: "Ridgeline Tap Room",
  state: "Submitted · ships Thu",
  fulfillmentSource: "Warehouse",
  fulfillmentOptions: ["Warehouse", "Taproom"],
  lines: [
    { key: "hazy", name: "Hazy IPA · ½ bbl keg", trailing: "4 · ATP 11" },
    { key: "pils", name: "Pils · 16 oz case", trailing: "10 · ATP −6", tone: "w" },
  ],
  oversellNotes: ["ATP is −6. Confirming oversells; that stays your call."],
  complianceNote: "Stout isn’t registered for Ohio. Check the Compliance registry.",
  showFixtureButtons: true,
};

export function ConfirmOrderView({ model, footer }: { model: ConfirmOrderViewModel; footer?: ReactNode }) {
  return (
    <>
      {E.back("Orders", model.title, undefined, model.backHref)}
      {E.ttl(model.where)}
      {E.fld("State", model.state)}
      {model.fulfillmentOptions
        ? E.pick("Fulfillment source", model.fulfillmentSource ?? "", model.fulfillmentOptions)
        : model.fulfillmentSource ? E.fld("Fulfillment source", model.fulfillmentSource) : null}
      {E.info(<>Lifecycle: submitted {E.arrow()} confirmed {E.arrow()} picked {E.arrow()} shipped {E.arrow()} delivered. Only the valid next action is active.</>)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, "", line.trailing, line.tone ?? "")}</Fragment>
      ))}
      {model.oversellNotes.map((note) => <Fragment key={note}>{E.note(note)}</Fragment>)}
      {model.complianceNote ? E.note(model.complianceNote) : null}
      {E.sp()}
      {footer ?? (model.showFixtureButtons ? E.btns([["Confirm order", "p"], ["Cancel order", "del"]]) : null)}
    </>
  );
}
