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
      {/* overflow-hidden: the unit tabs are a flex item with a content-based
          min-width, so on a narrow field they won't shrink past "oz gal bbl"
          — clip to the field's own border instead of spilling past it. */}
      <InputGroup className="overflow-hidden">
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          defaultValue={value}
          aria-label="Volume"
          className="text-2xl font-semibold"
        />
        {/* pr-0: the tab list already insets itself (p-[3px] in tabsListVariants),
            so the addon's default inline-end pr-2 only doubled up as dead space
            past the last unit. */}
        <InputGroupAddon align="inline-end" className="pr-0">
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
