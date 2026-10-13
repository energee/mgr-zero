"use client";

import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toast } from "sonner";
import { booksOpenedChange } from "@/lib/mgr/settings-view";

export type BrewerySettings = { name: string; timezone: string; ttb_registry_no: string | null; pa_license_no: string | null; customer_phone: string | null; fermentation_reading_due_hours: number; books_opened_on: string | null };

export function SettingsForm({ brewery }: { brewery: BrewerySettings }) {
  const action = useCommandAction();
  return <BrewerySettingsFormView
    initial={{ name: brewery.name, timezone: brewery.timezone, ttb: brewery.ttb_registry_no ?? "", pa: brewery.pa_license_no ?? "", phone: brewery.customer_phone ?? "", hours: String(brewery.fermentation_reading_due_hours), booksOpenedOn: brewery.books_opened_on ?? "" }}
    busy={action.busy} error={action.error}
    onSave={(v) => {
      // Two commands: the books-opened date is refused after a filed period, so it runs only when changed, after the basics save.
      const books = booksOpenedChange(brewery.books_opened_on ?? "", v.booksOpenedOn);
      const saved = () => toast.success("Brewery settings saved");
      void action.run("update_brewery", { name: v.name, timezone: v.timezone, ttbRegistryNo: v.ttb, paLicenseNo: v.pa, customerPhone: v.phone, readingDueHours: Number(v.hours) },
        books ? () => { void action.run("set_books_opened_on", books, saved); } : saved);
    }}
  />;
}
