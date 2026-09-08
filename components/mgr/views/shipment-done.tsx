// components/mgr/views/shipment-done.tsx — post-commit of Ship. Inventory mounts
// this view. Live ship-form.tsx stays a CommandForm wrapper and does not mount
// the view.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ShipmentDoneViewModel } from "@/lib/mgr/shipment-done-view";

export type { ShipmentDoneViewModel };

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
      {E.fld("Invoice", model.invoice)}
      {E.tape(tape ?? model.tape)}
      {E.info(model.info)}
    </>
  );
}
