"use client";

import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export type BrewerySettings = { name: string; timezone: string; ttb_registry_no: string | null; pa_license_no: string | null; customer_phone: string | null; fermentation_reading_due_hours: number };

export function SettingsForm({ brewery }: { brewery: BrewerySettings }) {
  const action = useCommandAction();
  return <BrewerySettingsFormView
    initial={{ name: brewery.name, timezone: brewery.timezone, ttb: brewery.ttb_registry_no ?? "", pa: brewery.pa_license_no ?? "", phone: brewery.customer_phone ?? "", hours: String(brewery.fermentation_reading_due_hours) }}
    busy={action.busy} error={action.error}
    onSave={(v) => { void action.run("update_brewery", { name: v.name, timezone: v.timezone, ttbRegistryNo: v.ttb, paLicenseNo: v.pa, customerPhone: v.phone, readingDueHours: Number(v.hours) }); }}
  />;
}
