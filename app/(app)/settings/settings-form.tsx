"use client";

import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toast } from "sonner";
import { booksOpenedChange, oneWayKegFeeChange } from "@/lib/mgr/settings-view";
import { dollarsInput } from "@/lib/mgr/money";

export type BrewerySettings = { name: string; timezone: string; ttb_registry_no: string | null; pa_license_no: string | null; customer_phone: string | null; fermentation_reading_due_hours: number; books_opened_on: string | null; one_way_keg_fee_cents: number };

export function SettingsForm({ brewery }: { brewery: BrewerySettings }) {
  const action = useCommandAction();
  return <BrewerySettingsFormView
    initial={{ name: brewery.name, timezone: brewery.timezone, ttb: brewery.ttb_registry_no ?? "", pa: brewery.pa_license_no ?? "", phone: brewery.customer_phone ?? "", hours: String(brewery.fermentation_reading_due_hours), booksOpenedOn: brewery.books_opened_on ?? "", oneWayKegFee: dollarsInput(brewery.one_way_keg_fee_cents) }}
    busy={action.busy} error={action.error}
    onSave={(v) => {
      // The books-opened date (frozen after any filed snapshot) and the one-way keg fee
      // each have their own command, so each runs only when changed, after the basics save.
      const books = booksOpenedChange(brewery.books_opened_on ?? "", v.booksOpenedOn);
      const fee = oneWayKegFeeChange(brewery.one_way_keg_fee_cents, v.oneWayKegFee);
      const saved = () => toast.success("Brewery settings saved");
      const saveFee = fee ? () => { void action.run("set_one_way_keg_fee", fee, saved); } : saved;
      void action.run("update_brewery", { name: v.name, timezone: v.timezone, ttbRegistryNo: v.ttb, paLicenseNo: v.pa, customerPhone: v.phone, readingDueHours: Number(v.hours) },
        books ? () => { void action.run("set_books_opened_on", books, saveFee); } : saveFee);
    }}
  />;
}
