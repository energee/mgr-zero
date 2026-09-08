// components/mgr/views/ship.tsx — Ship drawing for Invoice now and On delivery.
// Inventory mounts this view. Live create/edit stays ship-form.tsx (CommandForm;
// E.stq / E.pick are not controlled inputs).
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ShipViewModel } from "@/lib/mgr/ship-view";

export type { ShipViewModel };

export function ShipView({
  model,
  footer,
  fulfillmentOptions,
  tape,
  invoiceTiming,
}: {
  model: ShipViewModel;
  footer?: ReactNode;
  fulfillmentOptions?: string[];
  tape?: [ReactNode, ReactNode?][];
  invoiceTiming?: number;
}) {
  const timing = invoiceTiming ?? (model.invoiceTiming === "on_delivery" ? 1 : 0);
  return (
    <>
      {E.back(model.backTo, model.title, undefined, model.backHref)}
      {fulfillmentOptions
        ? E.pick("Fulfillment source", model.fulfillmentSource, fulfillmentOptions)
        : E.fld("Fulfillment source", model.fulfillmentSource)}
      {model.lines.map((line) => (
        <Fragment key={line.key}>{E.row(line.name, line.detail, E.stq(line.qty), line.tone ?? "")}</Fragment>
      ))}
      {model.shortNote ? E.nav("Reason", "required", "w") : null}
      {model.shortNote ? E.info(model.shortNote) : null}
      {E.inp("Carrier", "tracking · optional")}
      {E.chips(["Invoice now", "On delivery"], timing)}
      {E.tape(tape ?? model.tape)}
      {E.sp()}
      {footer ?? E.btn("Ship order", "irr")}
    </>
  );
}
