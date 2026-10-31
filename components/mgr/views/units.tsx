// components/mgr/views/units.tsx — the gravity unit chips. Gravity is the only
// unit a brewery chooses, and it has no page of its own (#1509 item 7): the
// brewery default sits under Brewery details in Settings and the personal
// choice in the Me sheet. Live passes GravityUnitForm in each place; the
// inventory draws GravityUnitControls. The preview sits with the personal
// chips so it reads the same model: live, a tapped chip and the preview
// change together.
import { E } from "@/components/mgr/e";
import { BREWERY_UNITS, MINE_UNITS, type UnitsViewModel } from "@/lib/mgr/units-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";

const NOT_CHANGED = "Readings are not changed.";

/** `part` picks the brewery default (admin, in Settings) or your own choice (Me). */
export function GravityUnitControls({ model, part, busy = false, onBrewery, onMine }: {
  model: UnitsViewModel; part: "brewery" | "mine"; busy?: boolean;
  onBrewery?: (unit: GravityUnit) => void; onMine?: (unit: GravityUnit | null) => void;
}) {
  const brewery = part === "brewery";
  return <>
    {E.ttl("Gravity unit")}
    {brewery
      ? E.chips(model.breweryOptions, model.breweryIndex, false, onBrewery ? { onChange: index => onBrewery(BREWERY_UNITS[index]), disabled: busy, label: "Brewery gravity unit" } : undefined)
      : E.chips(model.mineOptions, model.mineIndex, false, onMine ? { onChange: index => onMine(MINE_UNITS[index]), disabled: busy, label: "Your gravity unit" } : undefined)}
    <p className="text-sm text-muted-foreground">{brewery ? "What everyone here sees unless they choose their own under Me." : "Yours alone; it changes nothing for anyone else."} {NOT_CHANGED}</p>
    {!brewery && <p className="text-sm">{model.preview}</p>}
  </>;
}
