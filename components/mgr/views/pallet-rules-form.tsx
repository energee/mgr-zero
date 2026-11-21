// components/mgr/views/pallet-rules-form.tsx — the Pallets section of
// Settings: how much a pallet carries, how tall it may stand, and the ways one
// keg layer loads. The portal's pallet line and "Fill the pallet"
// follow it (lib/mgr/pallet-fit.ts). Its own form, saved only by Save pallets.
"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { palletRulesCommand, type PalletRulesValues } from "@/lib/mgr/pallet-rules-view";

export function PalletRulesFormView({ initial, sizes, onSave, busy = false, error = null }: {
  initial: PalletRulesValues;
  /** The keg sizes the brewery packages, one column each. */
  sizes: string[];
  onSave?: (values: PalletRulesValues) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const id = useId();
  const reason = palletRulesCommand(values, initial).reason;
  const setLayers = (kegLayers: PalletRulesValues["kegLayers"]) => setValues((current) => ({ ...current, kegLayers }));
  const number = (key: "maxLb" | "maxHeightIn" | "palletHeightIn", label: string, help: string, range: { min: number; max: number; step?: number }) => (
    <div className="flex min-w-0 flex-col gap-2">
      {E.edit(label, values[key], "number", undefined, { contextualLabels: true, id: `${id}-${key}`, onChange: (value: string) => setValues((current) => ({ ...current, [key]: value })), step: 1, required: true, ...range, "aria-describedby": `${id}-${key}-help` })}
      <FieldDescription id={`${id}-${key}-help`}>{help}</FieldDescription>
    </div>
  );
  return <form noValidate onSubmit={(event) => { event.preventDefault(); if (!busy && !reason) onSave?.(values); }}>
    <FieldSet className="min-w-0" disabled={busy}>
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Pallets</h2></FieldLegend>
      <FieldDescription>The customer portal uses these to tell a buyer how many pallets an order needs and what else fits. Nothing here blocks an order.</FieldDescription>
      <div className="grid gap-4 @min-[24rem]:grid-cols-2">
        {number("maxLb", "Most a pallet carries (lb)", "Beer and packaging together. A unit weighs its beer plus its format's packaging weight.", { min: 1, max: 10000 })}
        {number("maxHeightIn", "Tallest loaded pallet (in)", "Measured from the floor, pallet included. Layers stack until they reach it; each layer is as tall as its format's height.", { min: 12, max: 120 })}
        {number("palletHeightIn", "Empty pallet height (in)", "The pallet itself. It is taken off the tallest loaded pallet to get the room for kegs and cases.", { min: 0, max: 24, step: 0.1 })}
      </div>
      <section aria-label="Keg layers" className="flex flex-col gap-3">
        {E.group("Keg layers")}
        <FieldDescription>Each row is one way a layer of kegs loads. A pallet takes at most two keg layers, and cases wherever height is left. With no rows, each keg format&apos;s pallet fit is a layer.</FieldDescription>
        {values.kegLayers.map((row, index) => <div key={index} role="group" aria-label={`Keg layer ${index + 1}`} className="flex items-end gap-3">
          {sizes.map((size) => <div key={size} className="min-w-0 flex-1">
            {E.edit(`${SIZE_LABEL[size] ?? size} kegs, layer ${index + 1}`, row[size] ?? "", "number", undefined, { min: 0, max: 500, step: 1, onChange: (count: string) => setLayers(values.kegLayers.map((r, n) => (n === index ? { ...r, [size]: count } : r))) })}
          </div>)}
          {E.btn("Remove", "ghost", undefined, () => setLayers(values.kegLayers.filter((_, n) => n !== index)))}
        </div>)}
        {E.btn("Add keg layer", "g", undefined, () => setLayers([...values.kegLayers, {}]))}
      </section>
      <CommandFormMessage error={error} />
      <CommandFormFooter className="@min-[24rem]:flex-row @min-[24rem]:items-center @min-[24rem]:justify-end">{E.submit("Save pallets", { submitting: busy, reason })}</CommandFormFooter>
    </FieldSet>
  </form>;
}
