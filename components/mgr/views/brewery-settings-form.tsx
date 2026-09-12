"use client";

import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandFormMessage } from "@/components/mgr/command-form";

export type BrewerySettingsValues = { name: string; timezone: string; ttb: string; pa: string; phone: string; hours: string };

export function BrewerySettingsFormView({ initial, onSave, busy = false, error = null }: {
  initial: BrewerySettingsValues;
  onSave?: (values: BrewerySettingsValues) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const id = useId();
  const change = (key: keyof BrewerySettingsValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const field = (key: keyof BrewerySettingsValues, label: string, type = "text", required = false) => (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} value={values[key]} onChange={(event) => change(key, event.target.value)} type={type} required={required} list={key === "timezone" ? `${id}-zones` : undefined} />
    </div>
  );
  return <form className="grid gap-4 @min-[24rem]:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave?.(values); }}>
    {field("name", "Brewery name", "text", true)}
    {field("timezone", "Timezone", "text", true)}
    <datalist id={`${id}-zones`}>{["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"].map((zone) => <option key={zone} value={zone} />)}</datalist>
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
