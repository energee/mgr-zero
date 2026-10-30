// components/mgr/volume-field.tsx — a volume field shared by screen views:
// a Qty (components/mgr/qty.tsx) whose unit addon is a TabBar of volume units,
// with the value and unit callbacks named apart.
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
