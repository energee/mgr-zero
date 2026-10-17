"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, useComboboxSearch } from "@/components/ui/combobox";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";

export type BrewerySettingsValues = { name: string; timezone: string; ttb: string; pa: string; phone: string; hours: string; booksOpenedOn: string;
  /** The one-way keg fee in dollars ("10.00"), billed per one-way keg shipped. */
  oneWayKegFee: string };

const TIMEZONES = Intl.supportedValuesOf("timeZone");
const timezoneLabel = (timezone: string) => timezone.replaceAll("_", " ").replaceAll("/", " / ");

/** The Brewery details section of Settings: its own form, named by its legend, saved only by Save brewery. */
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
  const field = (key: keyof BrewerySettingsValues, label: string, type = "text", required = false) => (
    E.edit(label, values[key], type, undefined, { onChange: (nextValue: string) => change(key, nextValue), id: `${id}-${key}`, required })
  );
  return <form onSubmit={(event) => { event.preventDefault(); onSave?.(values); }}>
    <FieldSet className="min-w-0">
      <FieldLegend><h2 className="font-heading text-xl font-semibold">Brewery details</h2></FieldLegend>
      <div className="grid gap-4 @min-[24rem]:grid-cols-2">
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
          {E.edit("Books opened on · optional", values.booksOpenedOn, "date", undefined, { onChange: (nextValue: string) => change("booksOpenedOn", nextValue), "aria-describedby": `${id}-booksOpenedOn-help` })}
          <FieldDescription id={`${id}-booksOpenedOn-help`}>Set or clear before your first filed snapshot. After any report is filed, this value is fixed.</FieldDescription>
        </div>
        {E.edit("One-way keg fee ($)", values.oneWayKegFee, "number", undefined, { onChange: (nextValue: string) => change("oneWayKegFee", nextValue), id: `${id}-oneWayKegFee`, min: 0, step: 0.01 })}
        <div className="flex min-w-0 flex-col gap-2 [&>[data-slot=button-group]]:w-full">
          <Label htmlFor={`${id}-hours`}>Reading overdue after (hours)</Label>
          {E.stq(Number(values.hours), "Reading overdue after (hours)", { id: `${id}-hours`, value: values.hours, onChange: value => change("hours", value), min: 1, max: 168 })}
        </div>
      </div>
      <CommandFormMessage error={error} />
      <Button type="submit" className="w-full @min-[24rem]:w-auto @min-[24rem]:self-end" disabled={busy || !values.name.trim() || !values.timezone.trim()}>{busy ? "Saving…" : "Save brewery"}</Button>
    </FieldSet>
  </form>;
}
