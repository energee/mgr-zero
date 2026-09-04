// components/mgr/volume-field.tsx — an atomic format's volume, behind E.volume:
// a quantity whose unit addon is the per-instance unit choice. A component
// rather than a plain E helper only so the label and input share a generated
// id; a hardcoded one collides the moment two volume fields share a screen.
// It composes components/ui directly instead of taking the control as a prop,
// because screens.tsx renders on the server and a function cannot cross that
// boundary.
"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function VolumeField({ value, units, on }: { value: string; units: string[]; on: number }) {
  const id = React.useId();
  return (
    <Field>
      {/* htmlFor, so the visible label focuses the input and names it once. */}
      <FieldLabel htmlFor={id}>Volume</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          defaultValue={value}
          aria-label="Volume"
          className="text-2xl font-semibold"
        />
        <InputGroupAddon align="inline-end">
          <Tabs defaultValue={units[on]}>
            <TabsList variant="solid" className="w-fit">
              {units.map((u) => <TabsTrigger key={u} value={u}>{u}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
