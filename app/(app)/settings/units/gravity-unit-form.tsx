// app/(app)/settings/units/gravity-unit-form.tsx — the two inline controls on
// the Units page. Both are Selects over useCommandAction (no dialog:
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
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { GRAVITY_UNITS, gravityUnitLabel, type GravityUnit } from "@/lib/mgr/gravity-unit";


export function GravityUnitForm({
  brewery, mine, canSetBrewery,
}: {
  brewery: GravityUnit;
  mine: GravityUnit | null;
  canSetBrewery: boolean;
}) {
  const { busy, error, run } = useCommandAction();
  const [breweryChoice, setBreweryChoice] = useState<string>(brewery);
  const [mineChoice, setMineChoice] = useState<string>(mine ?? NONE);

  // The server props are the truth once they catch up — including a refresh
  // that failed, which puts the controls back on what is actually stored.
  // Adjusted during render (React's documented "derive state from props"
  // pattern) rather than in an effect, which would be a second render pass and
  // is what react-hooks/set-state-in-effect forbids.
  const [seen, setSeen] = useState({ brewery, mine });
  if (seen.brewery !== brewery || seen.mine !== mine) {
    setSeen({ brewery, mine });
    setBreweryChoice(brewery);
    setMineChoice(mine ?? NONE);
  }

  return (
    <div className="flex flex-col gap-6">
      {canSetBrewery ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="gu-brewery">Brewery default</Label>
          <Select
            value={breweryChoice}
            disabled={busy}
            onValueChange={(v) => { setBreweryChoice(v); run("set_brewery_gravity_unit", { unit: v }); }}
          >
            <SelectTrigger id="gu-brewery"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRAVITY_UNITS.map((u) => (
                <SelectItem key={u} value={u}>{gravityUnitLabel(u)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            What everyone here sees unless they choose otherwise below.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="gu-mine">Your preference</Label>
        <Select
          value={mineChoice}
          disabled={busy}
          onValueChange={(v) => {
            setMineChoice(v);
            run("set_my_gravity_unit", { unit: v === NONE ? null : v });
          }}
        >
          <SelectTrigger id="gu-mine"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Use brewery default ({gravityUnitLabel(brewery)})</SelectItem>
            {GRAVITY_UNITS.map((u) => (
              <SelectItem key={u} value={u}>{gravityUnitLabel(u)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Yours alone — it changes nothing for anyone else.
        </p>
      </div>

      <CommandFormMessage error={error} />
    </div>
  );
}
