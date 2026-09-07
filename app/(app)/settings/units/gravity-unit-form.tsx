// app/(app)/settings/units/gravity-unit-form.tsx — the two inline controls on
// the Units page. Both are plain <select>s over useCommandAction (no dialog:
// there is nothing to confirm and one field to change), so a choice saves as
// it is made and the server component re-reads on router.refresh(). "Use
// brewery default" is the null personal override, which is why the personal
// select's value is a string sentinel rather than an empty option.
//
// Each select holds its own chosen value in state rather than reading the
// server prop directly: the write and the router.refresh() that follows it are
// not instant, and a controlled select bound to the stale prop visibly snaps
// back to the old unit for that gap. State seeded from the prop, re-synced when
// the refreshed prop arrives, keeps the control on what the brewer just picked.
"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { GRAVITY_UNITS, gravityUnitLabel, type GravityUnit } from "@/lib/mgr/gravity-unit";

const DEFAULT = "__default__";

export function GravityUnitForm({
  brewery, mine, canSetBrewery, breweryLabel,
}: {
  brewery: GravityUnit;
  mine: GravityUnit | null;
  canSetBrewery: boolean;
  breweryLabel: string;
}) {
  const { busy, error, run } = useCommandAction();
  const [breweryChoice, setBreweryChoice] = useState<string>(brewery);
  const [mineChoice, setMineChoice] = useState<string>(mine ?? DEFAULT);

  // The server props are the truth once they catch up — including a refresh
  // that failed, which puts the controls back on what is actually stored.
  // Adjusted during render (React's documented "derive state from props"
  // pattern) rather than in an effect, which would be a second render pass and
  // is what react-hooks/set-state-in-effect forbids.
  const [seen, setSeen] = useState({ brewery, mine });
  if (seen.brewery !== brewery || seen.mine !== mine) {
    setSeen({ brewery, mine });
    setBreweryChoice(brewery);
    setMineChoice(mine ?? DEFAULT);
  }

  return (
    <div className="flex flex-col gap-6">
      {canSetBrewery ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="gu-brewery">Brewery default</Label>
          <NativeSelect
            id="gu-brewery"
            className="max-w-xs"
            value={breweryChoice}
            disabled={busy}
            onChange={(e) => { setBreweryChoice(e.target.value); run("set_brewery_gravity_unit", { unit: e.target.value }); }}
          >
            {GRAVITY_UNITS.map((u) => (
              <option key={u} value={u}>{gravityUnitLabel(u)}</option>
            ))}
          </NativeSelect>
          <p className="text-sm text-muted-foreground">
            What everyone here sees unless they choose otherwise below.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="gu-mine">Your preference</Label>
        <NativeSelect
          id="gu-mine"
          className="max-w-xs"
          value={mineChoice}
          disabled={busy}
          onChange={(e) => {
            setMineChoice(e.target.value);
            run("set_my_gravity_unit", { unit: e.target.value === DEFAULT ? null : e.target.value });
          }}
        >
          <option value={DEFAULT}>Use brewery default ({breweryLabel})</option>
          {GRAVITY_UNITS.map((u) => (
            <option key={u} value={u}>{gravityUnitLabel(u)}</option>
          ))}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          Yours alone — it changes nothing for anyone else.
        </p>
      </div>

      <CommandFormMessage error={error} />
    </div>
  );
}
