// components/mgr/volume-field.tsx — an atomic format's volume, behind E.volume:
// a quantity whose unit addon is the per-instance unit choice. Qty draws the
// visible label and ties it to the input. It builds the field from
// components/mgr/qty.tsx — the same Qty and TabBar behind E.qty and E.tabs —
// rather than taking the control as a prop, because screens.tsx renders on the
// server and a function cannot cross that boundary.
"use client";

import { Qty, TabBar } from "@/components/mgr/qty";

export function VolumeField({ value, units, on, onValueChange, onUnitChange, label = "Volume" }: {
  label?: string;
  value: string;
  units: string[];
  on: number;
  onValueChange?: (value: string) => void;
  onUnitChange?: (unit: string) => void;
}) {
  return (
    <Qty
      value={value}
      onChange={onValueChange}
      unit={<TabBar names={units} on={on} cls="w-fit" onChange={onUnitChange} />}
      label={label}
    />
  );
}
