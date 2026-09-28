// components/mgr/views/units.tsx — Settings · Units. Live passes
// GravityUnitForm as controls; inventory draws the chip groups. Back, info,
// and the formatGravity example always draw.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { UnitsViewModel } from "@/lib/mgr/units-view";

export type { UnitsViewModel };

export function GravityUnitControls({ model, canSetBrewery = true, busy = false, onBrewery, onMine }: {
  model: UnitsViewModel; canSetBrewery?: boolean; busy?: boolean;
  onBrewery?: (index: number) => void; onMine?: (index: number) => void;
}) {
  return <>
    {canSetBrewery && <>{E.ttl("Brewery default")}{E.chips(model.breweryOptions, model.breweryIndex, false, onBrewery ? { onChange: onBrewery, disabled: busy, label: "Brewery default" } : undefined)}</>}
    {E.ttl("Your preference")}
    {E.chips(model.mineOptions, model.mineIndex, false, onMine ? { onChange: onMine, disabled: busy, label: "Your preference" } : undefined)}
  </>;
}

export function UnitsView({
  model,
  controls,
  backLabel = "Settings",
}: {
  model: UnitsViewModel;
  /** Live: GravityUnitForm. Inventory draws ttl + chips. */
  controls?: ReactNode;
  backLabel?: string;
}) {
  return (
    <>
      {E.back(backLabel, "Units", undefined, model.backHref)}
      {E.info("Gravity is always stored in °Plato. This changes only how it is shown and typed.")}
      {controls !== undefined ? controls : <GravityUnitControls model={model} />}
      {E.fld("A 12.5 °P reading shows as", model.example)}
    </>
  );
}
