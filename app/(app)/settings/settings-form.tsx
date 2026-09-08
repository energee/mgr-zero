// app/(app)/settings/settings-form.tsx — the Settings page's inline brewery
// form: name, timezone, TTB registry number, PA license, customer-facing phone
// and reading-overdue hours, saved together by update_brewery.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction } from "@/lib/commands/use-command-form";

export type BrewerySettings = { name: string; timezone: string; ttb_registry_no: string | null; pa_license_no: string | null; customer_phone: string | null; fermentation_reading_due_hours: number };

export function SettingsForm({ brewery }: { brewery: BrewerySettings }) {
  const [v, setV] = useState({
    name: brewery.name, timezone: brewery.timezone, ttb: brewery.ttb_registry_no ?? "", pa: brewery.pa_license_no ?? "",
    phone: brewery.customer_phone ?? "", hours: String(brewery.fermentation_reading_due_hours),
  });
  const action = useCommandAction();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const field = (k: keyof typeof v, label: string, type = "text", extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`brewery-${k}`}>{label}</Label>
      <Input id={`brewery-${k}`} type={type} value={v[k]} onChange={set(k)} {...extra} />
    </div>
  );
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      void action.run("update_brewery", { name: v.name, timezone: v.timezone, ttbRegistryNo: v.ttb, paLicenseNo: v.pa, customerPhone: v.phone, readingDueHours: Number(v.hours) });
    }}>
      {field("name", "Brewery name", "text", { required: true })}
      {field("timezone", "Timezone", "text", { required: true, list: "brewery-timezones" })}
      <datalist id="brewery-timezones">{["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"].map((z) => <option key={z} value={z} />)}</datalist>
      {field("ttb", "TTB registry number")}
      {field("pa", "PA license")}
      {field("phone", "Customer-facing phone", "tel")}
      {field("hours", "Reading overdue after (hours)", "number", { min: 1, max: 168, required: true })}
      <CommandFormMessage error={action.error} />
      <Button type="submit" disabled={action.busy || !v.name.trim() || !v.timezone.trim()}>{action.busy ? "Saving…" : "Save brewery"}</Button>
    </form>
  );
}
