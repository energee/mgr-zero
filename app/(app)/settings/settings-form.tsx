"use client";

import { BrewerySettingsFormView } from "@/components/mgr/views/brewery-settings-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toast } from "sonner";
import { booksOpenedChange, oneWayKegFeeChange, toBrewerySettingsValues, breweryOperatingDefaultsCommand, brewerySettingsReason, type BrewerySettings } from "@/lib/mgr/settings-view";

export type { BrewerySettings } from "@/lib/mgr/settings-view";

export function SettingsForm({ brewery, hasFiledReports = false }: { brewery: BrewerySettings; hasFiledReports?: boolean }) {
  const action = useCommandAction();
  const initial = toBrewerySettingsValues(brewery);
  return <BrewerySettingsFormView
    basisLocked={hasFiledReports}
    initial={initial}
    busy={action.busy} error={action.error}
    onSave={(v) => {
      if (action.busy || brewerySettingsReason(v, initial)) return;
      const defaults = breweryOperatingDefaultsCommand(v);
      // The books-opened date (frozen after any filed snapshot) and the one-way keg fee
      // each have their own command, so each runs only when changed, after the basics save.
      const books = booksOpenedChange(brewery.books_opened_on ?? "", v.booksOpenedOn);
      const fee = oneWayKegFeeChange(brewery.one_way_keg_fee_cents, v.oneWayKegFee);
      const saved = () => toast.success("Brewery settings saved");
      const saveFee = fee ? () => { void action.run("set_one_way_keg_fee", fee, saved); } : saved;
      const saveDefaults = () => { void action.run(defaults.name, defaults.input, books ? () => { void action.run("set_books_opened_on", books, saveFee); } : saveFee); };
      void action.run("update_brewery", { name: v.name, timezone: v.timezone, ttbRegistryNo: v.ttb, paLicenseNo: v.pa, customerPhone: v.phone, readingDueHours: defaults.input.readingDueHours }, saveDefaults);
    }}
  />;
}
