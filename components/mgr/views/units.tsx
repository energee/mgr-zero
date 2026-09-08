// components/mgr/views/units.tsx — Settings · Units. Live passes
// GravityUnitForm as controls; inventory draws the chip groups. Back, info,
// and the formatGravity example always draw.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { UnitsViewModel } from "@/lib/mgr/units-view";

export type { UnitsViewModel };

export function UnitsView({
  model,
  controls,
}: {
  model: UnitsViewModel;
  /** Live: GravityUnitForm. Inventory draws ttl + chips. */
  controls?: ReactNode;
}) {
  return (
    <>
      {E.back("Settings", "Units", undefined, model.backHref)}
      {E.info("Gravity is always stored in °Plato. This changes only how it is shown and typed.")}
      {controls ?? (
        <>
          {E.ttl("Brewery default")}
          {E.chips(model.breweryOptions, model.breweryIndex)}
          {E.ttl("Your preference")}
          {E.chips(model.mineOptions, model.mineIndex)}
        </>
      )}
      {E.fld("A 12.5 °P reading shows as", model.example)}
    </>
  );
}
