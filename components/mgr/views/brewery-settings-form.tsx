"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, useComboboxAnchor } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";

export type BrewerySettingsValues = { name: string; timezone: string; ttb: string; pa: string; phone: string; hours: string };

const TIMEZONES = Intl.supportedValuesOf("timeZone");
const timezoneLabel = (timezone: string) => timezone.replaceAll("_", " ").replaceAll("/", " / ");

export function BrewerySettingsFormView({ initial, onSave, busy = false, error = null }: {
  initial: BrewerySettingsValues;
  onSave?: (values: BrewerySettingsValues) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [timezoneQuery, setTimezoneQuery] = useState("");
  const timezoneAnchor = useComboboxAnchor();
  const id = useId();
  const change = (key: keyof BrewerySettingsValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const field = (key: keyof BrewerySettingsValues, label: string, type = "text", required = false) => (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} value={values[key]} onChange={(event) => change(key, event.target.value)} type={type} required={required} />
    </div>
  );
  return <form className="grid gap-4 @min-[24rem]:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave?.(values); }}>
    {field("name", "Brewery name", "text", true)}
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={`${id}-timezone`}>Timezone</Label>
      <Combobox
        items={TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES]}
        value={values.timezone}
        open={timezoneOpen}
        inputValue={timezoneOpen ? timezoneQuery : timezoneLabel(values.timezone)}
        itemToStringLabel={timezoneLabel}
        itemToStringValue={(timezone) => timezone}
        onOpenChange={(open) => { setTimezoneOpen(open); if (open) setTimezoneQuery(""); }}
        onInputValueChange={setTimezoneQuery}
        onValueChange={(timezone) => timezone && change("timezone", timezone)}
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
    <div className="flex min-w-0 flex-col gap-2 [&>[data-slot=button-group]]:w-full">
      <Label htmlFor={`${id}-hours`}>Reading overdue after (hours)</Label>
      {E.stq(Number(values.hours), "Reading overdue after (hours)", { id: `${id}-hours`, value: values.hours, onChange: (value) => change("hours", value), min: 1, max: 168 })}
    </div>
    {error && <div className="@min-[24rem]:col-span-2"><CommandFormMessage error={error} /></div>}
    <div className="flex justify-end border-t pt-4 @min-[24rem]:col-span-2"><Button type="submit" className="w-full @min-[24rem]:w-auto" disabled={busy || !values.name.trim() || !values.timezone.trim()}>{busy ? "Saving…" : "Save brewery"}</Button></div>
  </form>;
}
