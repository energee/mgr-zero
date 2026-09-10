// components/mgr/volume-field.tsx — an atomic format's volume, behind E.volume:
// a quantity whose unit addon is the per-instance unit choice. A component
// rather than a plain E helper only so the label and input share a generated
// id; a hardcoded one collides the moment two volume fields share a screen.
// It builds the field from components/mgr/qty.tsx — the same Qty and TabBar
// behind E.qty and E.tabs — rather than taking the control as a prop, because
// screens.tsx renders on the server and a function cannot cross that boundary.
"use client";

import * as React from "react";
import { Qty, TabBar } from "@/components/mgr/qty";
import { Field, FieldLabel } from "@/components/ui/field";

export function VolumeField({ value, units, on, onValueChange, onUnitChange }: {
  value: string;
  units: string[];
  on: number;
  onValueChange?: (value: string) => void;
  onUnitChange?: (unit: string) => void;
}) {
  const id = React.useId();
  return (
    <Field>
      {/* htmlFor, so the visible label focuses the input and names it once. */}
      <FieldLabel htmlFor={id}>Volume</FieldLabel>
      <Qty
        value={value}
        onChange={onValueChange}
        unit={<TabBar names={units} on={on} cls="w-fit" onChange={onUnitChange} />}
        label="Volume"
        id={id}
      />
    </Field>
  );
}
