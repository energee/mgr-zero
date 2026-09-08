// components/mgr/views/review-order.tsx — Review order sheet. Inventory
// paints toReviewOrderViewProps(the Shop cart). Live create stays Cart:
// E.stq is not a controlled input.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import type { ReviewOrderViewModel } from "@/lib/mgr/review-order-view";

export type { ReviewOrderViewModel };

export function ReviewOrderView({ model }: { model: ReviewOrderViewModel }) {
  return (
    <>
      {model.lines.map((line) => (
        <Fragment key={line.key}>
          {E.row(line.name, line.price, E.stq(line.qty, line.qtyLabel))}
        </Fragment>
      ))}
      {model.depositDetail && model.depositAmount
        ? E.row("Keg deposit", model.depositDetail, model.depositAmount)
        : null}
      {E.fld("Subtotal", model.subtotal)}
      {E.fld("Tax", model.tax)}
      {E.fld("Ship-to", model.shipTo)}
      {E.fld("Requested date", model.requestedDate)}
      {E.row("Ships from", model.source)}
      {E.fld("Your PO number", model.po)}
      {E.info(model.info)}
      {E.sp()}
      {E.btn(model.placeVerb, "p")}
    </>
  );
}
