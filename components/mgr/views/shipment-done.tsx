// components/mgr/views/shipment-done.tsx — post-commit of Ship. Inventory and
// the live page both pass toShipmentDoneViewProps(get_order + get_invoice).
// Ship stays here, since only this page shows the shipped tape and keg-shell
// warnings; Open order (the model's backHref) goes on to the order (#1489).
import type { ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import type { ShipmentDoneViewModel } from "@/lib/mgr/shipment-done-view";

export function ShipmentDoneView({
  model,
  tape,
}: {
  model: ShipmentDoneViewModel;
  tape?: [ReactNode, ReactNode?][];
}) {
  return (
    <>
      {E.back(model.backTo, model.title, undefined, model.backHref)}
      {E.fld("Invoice", model.invoiceHref ? <Link href={model.invoiceHref} className="underline underline-offset-2">{model.invoice}</Link> : model.invoice)}
      {E.tape(tape ?? model.tape)}
      {model.warnings.map((warning) => <div key={warning}>{E.note(warning)}</div>)}
      {E.info(model.info)}
      {model.routeHref && E.btn("Add to route", "p", model.routeHref, undefined, { "data-to": "Route" })}
      {E.btn("Open order", "g", model.backHref, undefined, { "data-to": "Order" })}
      {model.returnHref && <div className="flex justify-end">{E.act("Return shipment", "primary", model.returnHref)}</div>}
    </>
  );
}
