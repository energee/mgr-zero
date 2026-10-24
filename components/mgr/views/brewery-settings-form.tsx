"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";

import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { breweryOperatingDefaultsCommand, type BrewerySettingsValues } from "@/lib/mgr/settings-view";
import { TimezonePicker } from "@/components/mgr/timezone-picker";

/** The Brewery details section of Settings: its own form, named by its legend, saved only by Save brewery. */
export function BrewerySettingsFormView({ initial, onSave, busy = false, error = null, basisLocked = false }: {
  initial: BrewerySettingsValues;
  onSave?: (values: BrewerySettingsValues) => void;
  busy?: boolean;
  error?: string | null;
  basisLocked?: boolean;
}) {
  const [values, setValues] = useState(initial);
  const id = useId();
  const change = (key: keyof BrewerySettingsValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const defaults = breweryOperatingDefaultsCommand(values);
  const field = (key: keyof BrewerySettingsValues, label: string, type = "text", required = false) => (
    E.edit(label, values[key], type, undefined, { onChange: (nextValue: string) => change(key, nextValue), id: `${id}-${key}`, required })
  );
  return <form onSubmit={(event) => { event.preventDefault(); if (defaults.valid) onSave?.(values); }}>
    <FieldSet className="min-w-0">
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Brewery details</h2></FieldLegend>
      <div className="grid gap-4 @min-[24rem]:grid-cols-2">
        {field("name", "Brewery name", "text", true)}
        <TimezonePicker id={`${id}-timezone`} label="Timezone" value={values.timezone} onChange={(timezone) => change("timezone", timezone)} />
        {field("ttb", "TTB registry number")}
        {field("pa", "PA license")}
        {field("phone", "Customer-facing phone", "tel")}
        <div className="flex min-w-0 flex-col gap-2">
          {E.edit("One-way keg fee ($)", values.oneWayKegFee, "number", undefined, { onChange: (nextValue: string) => change("oneWayKegFee", nextValue), id: `${id}-oneWayKegFee`, min: 0, step: 0.01, "aria-describedby": `${id}-oneWayKegFee-help` })}
          <FieldDescription id={`${id}-oneWayKegFee-help`}>Charged for each one-way keg shipped. Blank or 0 means no fee.</FieldDescription>
        </div>
        <div className="flex min-w-0 flex-col gap-2 [&>[data-slot=button-group]]:w-full">
          <Label htmlFor={`${id}-hours`}>Reading overdue after (hours)</Label>
          {E.stq(Number(values.hours), "Reading overdue after (hours)", { id: `${id}-hours`, value: values.hours, onChange: value => change("hours", value), min: 1, max: 168, "aria-describedby": `${id}-hours-help` })}
          <FieldDescription id={`${id}-hours-help`}>Required: a whole number from 1 to 168. It cannot be blank or 0.</FieldDescription>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {E.edit("Days to package", values.daysToPackage, "number", undefined, { onChange: (value) => change("daysToPackage", value), id: `${id}-daysToPackage`, min: 1, max: 120, step: 1, required: true })}
          <FieldDescription>Expected days from brewing to packaging. Planning uses this for projected batch packaging materials.</FieldDescription>
        </div>
        <div className="flex min-w-0 flex-col gap-2 @min-[24rem]:col-span-2">
          {E.edit("Books opened on · optional", values.booksOpenedOn, "date", undefined, { onChange: (nextValue: string) => change("booksOpenedOn", nextValue), id: `${id}-booksOpenedOn`, disabled: basisLocked, "aria-describedby": `${id}-booksOpenedOn-help` })}
          <FieldDescription id={`${id}-booksOpenedOn-help`}>{basisLocked ? "Filed reporting basis. Use Correct reporting basis below to record a correction and flag affected periods." : "Set or clear before your first filed snapshot. Later changes require a recorded admin correction."}</FieldDescription>
        </div>
      </div>
      <CommandFormMessage error={error} />
      <Button type="submit" className="w-full @min-[24rem]:w-auto @min-[24rem]:self-end" disabled={busy || !values.name.trim() || !values.timezone.trim() || !defaults.valid}>{busy ? "Saving…" : "Save brewery"}</Button>
    </FieldSet>
  </form>;
}
