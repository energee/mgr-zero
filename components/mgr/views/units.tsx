// components/mgr/views/units.tsx — Settings · Units. Gravity is the only
// unit a brewery chooses, so the page is one "Gravity unit" section. Live
// passes GravityUnitForm as controls; inventory draws GravityUnitControls.
// The preview sits in the controls so it reads the same model as the chips:
// live, a tapped chip and the preview change together. Back and the
// display-only note always draw.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { BREWERY_UNITS, MINE_UNITS, type UnitsViewModel } from "@/lib/mgr/units-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";

export type { UnitsViewModel };

export function GravityUnitControls({ model, canSetBrewery = true, busy = false, onBrewery, onMine }: {
  model: UnitsViewModel; canSetBrewery?: boolean; busy?: boolean;
  onBrewery?: (unit: GravityUnit) => void; onMine?: (unit: GravityUnit | null) => void;
}) {
  return <>
    {canSetBrewery && <>
      {E.ttl("Brewery default")}
      {E.chips(model.breweryOptions, model.breweryIndex, false, onBrewery ? { onChange: index => onBrewery(BREWERY_UNITS[index]), disabled: busy, label: "Brewery default" } : undefined)}
      <p className="text-sm text-muted-foreground">What everyone here sees unless they choose otherwise below.</p>
    </>}
    {E.ttl("Your preference")}
    {E.chips(model.mineOptions, model.mineIndex, false, onMine ? { onChange: index => onMine(MINE_UNITS[index]), disabled: busy, label: "Your preference" } : undefined)}
    <p className="text-sm text-muted-foreground">Yours alone; it changes nothing for anyone else.</p>
    {E.ttl("Preview")}
    <p className="text-sm">{model.preview}</p>
  </>;
}

export function UnitsView({
  model,
  controls,
  backLabel = "Settings",
}: {
  model: UnitsViewModel;
  /** Live: GravityUnitForm. Inventory draws GravityUnitControls (chips + preview). */
  controls?: ReactNode;
  backLabel?: string;
}) {
  return (
    <>
      {E.back(backLabel, "Units", undefined, model.backHref)}
      {E.group("Gravity unit")}
      {E.info("Changing this only changes how gravity is shown and typed. Your readings are not changed.")}
      {controls !== undefined ? controls : <GravityUnitControls model={model} />}
    </>
  );
}
