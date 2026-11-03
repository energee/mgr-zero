// components/mgr/volume-field.tsx — the shared volume input and its unit choice.
"use client";

import { Qty } from "@/components/mgr/qty";
import { RadioGroup } from "radix-ui";

export function VolumeField({ value, units, on, onValueChange, onUnitChange, label = "Volume" }: {
  label?: string;
  value: string;
  units: string[];
  on: number;
  onValueChange?: (value: string) => void;
  onUnitChange?: (unit: string) => void;
}) {
  const unit = units[on];
  return (
    <Qty
      value={value}
      onChange={onValueChange}
      unit={<RadioGroup.Root aria-label={`${label} unit`} value={onUnitChange ? unit : undefined} defaultValue={onUnitChange ? undefined : unit} onValueChange={onUnitChange} className="flex gap-0 rounded-lg border border-foreground/40">
        {units.map(name => <RadioGroup.Item key={name} value={name} className="cursor-pointer rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-muted">{name}</RadioGroup.Item>)}
      </RadioGroup.Root>}
      label={label}
    />
  );
}
