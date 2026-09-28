// Shared unit choices save immediately and restore persisted values after failure.
"use client";

import { useState } from "react";
import { GravityUnitControls } from "@/components/mgr/views/units";
import { toUnitsViewProps } from "@/lib/mgr/units-view";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { GRAVITY_UNITS, type GravityUnit } from "@/lib/mgr/gravity-unit";

export function GravityUnitForm({
  brewery, mine, canSetBrewery,
}: {
  brewery: GravityUnit;
  mine: GravityUnit | null;
  canSetBrewery: boolean;
}) {
  const { busy, error, run } = useCommandAction();
  const [breweryChoice, setBreweryChoice] = useState<GravityUnit>(brewery);
  const [mineChoice, setMineChoice] = useState<GravityUnit | null>(mine);

  // The server props are the truth once they catch up — including a refresh
  // that failed, which puts the controls back on what is actually stored.
  // Adjusted during render (React's documented "derive state from props"
  // pattern) rather than in an effect, which would be a second render pass and
  // is what react-hooks/set-state-in-effect forbids.
  const [seen, setSeen] = useState({ brewery, mine });
  if (seen.brewery !== brewery || seen.mine !== mine) {
    setSeen({ brewery, mine });
    setBreweryChoice(brewery);
    setMineChoice(mine);
  }

  return <div className="flex flex-col gap-2">
    <GravityUnitControls model={toUnitsViewProps({ brewery: breweryChoice, mine: mineChoice, effective: mineChoice ?? breweryChoice })} canSetBrewery={canSetBrewery} busy={busy}
      onBrewery={index => { const unit = GRAVITY_UNITS[index]; setBreweryChoice(unit); run("set_brewery_gravity_unit", { unit }).then(ok => { if (!ok) setBreweryChoice(brewery); }); }}
      onMine={index => { const unit = index === 0 ? null : GRAVITY_UNITS[index - 1]; setMineChoice(unit); run("set_my_gravity_unit", { unit }).then(ok => { if (!ok) setMineChoice(mine); }); }} />
    <CommandFormMessage error={error} />
  </div>;
}
