"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, useComboboxSearch } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { breweryOperatingDefaultsCommand, type BrewerySettingsValues } from "@/lib/mgr/settings-view";

const TIMEZONES = Intl.supportedValuesOf("timeZone");
const timezoneLabel = (timezone: string) => timezone.replaceAll("_", " ").replaceAll("/", " / ");

export function BrewerySettingsFormView({ initial, onSave, busy = false, error = null }: {
  initial: BrewerySettingsValues;
  onSave?: (values: BrewerySettingsValues) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const { anchor: timezoneAnchor, props: timezoneSearch } = useComboboxSearch(timezoneLabel(values.timezone));
  const id = useId();
  const change = (key: keyof BrewerySettingsValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const defaults = breweryOperatingDefaultsCommand(values);
  const field = (key: keyof BrewerySettingsValues, label: string, type = "text", required = false) => (
    E.edit(label, values[key], type, undefined, { onChange: (nextValue: string) => change(key, nextValue), id: `${id}-${key}`, required })
  );
  return <form className="grid gap-4 @min-[24rem]:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (defaults.valid) onSave?.(values); }}>
    {field("name", "Brewery name", "text", true)}
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={`${id}-timezone`}>Timezone</Label>
      <Combobox
        items={TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES]}
        value={values.timezone}
        itemToStringLabel={timezoneLabel}
        itemToStringValue={(timezone) => timezone}
        onValueChange={(timezone) => timezone && change("timezone", timezone)}
        {...timezoneSearch}
      >
        <div ref={timezoneAnchor}>
          <ComboboxInput id={`${id}-timezone`} placeholder="Search timezones…" required />
        </div>
        <ComboboxContent anchor={timezoneAnchor}>
          <ComboboxEmpty>No timezone found.</ComboboxEmpty>
          <ComboboxList>{(timezone: string) => <ComboboxItem key={timezone} value={timezone}>{timezoneLabel(timezone)}</ComboboxItem>}</ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
    {field("ttb", "TTB registry number")}
    {field("pa", "PA license")}
    {field("phone", "Customer-facing phone", "tel")}
    <div className="flex min-w-0 flex-col gap-2">
      {field("booksOpenedOn", "Books opened on · optional", "date")}
      <p className="text-xs text-muted-foreground">Set or clear before your first filed snapshot. After any report is filed, this value is fixed.</p>
    </div>
    {E.edit("One-way keg fee ($)", values.oneWayKegFee, "number", undefined, { onChange: (nextValue: string) => change("oneWayKegFee", nextValue), id: `${id}-oneWayKegFee`, min: 0, step: 0.01 })}
    <div className="flex min-w-0 flex-col gap-2 [&>[data-slot=button-group]]:w-full">
      <Label htmlFor={`${id}-hours`}>Reading overdue after (hours)</Label>
      {E.stq(Number(values.hours), "Reading overdue after (hours)", { id: `${id}-hours`, value: values.hours, onChange: value => change("hours", value), min: 1, max: 168 })}
    </div>
    <div className="flex min-w-0 flex-col gap-2">
      {E.edit("Days to package", values.daysToPackage, "number", undefined, { onChange: (value) => change("daysToPackage", value), id: `${id}-daysToPackage`, min: 1, max: 120, step: 1, required: true })}
      <p className="text-xs text-muted-foreground">Expected days from brewing to packaging. Planning uses this for projected batch packaging materials.</p>
    </div>
    {error && <div className="@min-[24rem]:col-span-2"><CommandFormMessage error={error} /></div>}
    <div className="flex justify-end border-t pt-4 @min-[24rem]:col-span-2"><Button type="submit" className="w-full @min-[24rem]:w-auto" disabled={busy || !values.name.trim() || !values.timezone.trim() || !defaults.valid}>{busy ? "Saving…" : "Save brewery"}</Button></div>
  </form>;
}
