// components/mgr/views/ship-to.tsx — Ship-to form sheet (inventory).
// Live create/edit stays ship-to-form.tsx: E.inp is not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ShipToViewModel } from "@/lib/mgr/ship-to-view";

export type { ShipToViewModel };

export function ShipToView({
  model,
  footer,
}: {
  model: ShipToViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.ttl(model.title)}
      {E.inp("Label", model.label)}
      {E.inp("Address", model.address)}
      {E.inp("City", model.city)}
      {E.inp("State", model.state)}
      {E.inp("Postal code", model.zip)}
      {E.row("Default ship-to", "selected first on new orders", E.sw(model.isDefault, "Default ship-to"), model.isDefault ? "ok" : "")}
      {footer !== undefined ? footer : E.btn("Save ship-to")}
    </>
  );
}
