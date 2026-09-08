// components/mgr/views/new-order.tsx — New order sheet drawing (inventory).
// Live create stays in order-form.tsx: E.pick is not a controlled CommandForm.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { NewOrderViewModel } from "@/lib/mgr/new-order-view";

export type { NewOrderViewModel };

export function NewOrderView({ model }: { model: NewOrderViewModel }) {
  return (
    <>
      {E.back("Orders", "New order")}
      {E.cols(
        E.pick("Customer", model.customer, model.customers),
        E.pick("Ship-to", model.shipTo, model.shipTos),
        E.pick("Source location", model.source, model.sources),
        E.edit("Requested ship", model.requestedShip, "date"),
      )}
      {E.edit("Customer PO", model.po)}
      {model.lines.map((line) => (
        <Fragment key={line.name}>
          {E.row(line.name, `ATP ${line.atp} at ${model.source}`, E.stq(line.qty), line.warning ? "w" : "")}
        </Fragment>
      ))}
      {E.btn("Add line", "g")}
      {E.info("Order number is assigned on commit.")}
      {E.sp()}
      {E.btn("Save draft")}
    </>
  );
}
