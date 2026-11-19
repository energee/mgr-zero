// lib/mgr/settings-view.ts — view-model for Settings (get_brewery extras).
import type { GatewayModelOption } from "@/lib/chat/models";
import type { ReportingBasisCorrection } from "@/lib/commands/compliance";
import { submitReason } from "@/lib/mgr/submit-reason";
import { phoneError } from "@/lib/mgr/phone";
import type { UnitsViewModel } from "@/lib/mgr/units-view";

export type BrewerySettings = {
  name: string; timezone: string; ttb_registry_no: string | null;
  customer_phone: string | null; fermentation_reading_due_hours: number; days_to_package: number;
  books_opened_on: string | null;
};

export type BrewerySettingsValues = {
  name: string; timezone: string; ttb: string; phone: string; hours: string;
  daysToPackage: string; booksOpenedOn: string;
};

export function toBrewerySettingsValues(brewery: BrewerySettings): BrewerySettingsValues {
  return {
    name: brewery.name, timezone: brewery.timezone, ttb: brewery.ttb_registry_no ?? "",
    phone: brewery.customer_phone ?? "",
    hours: String(brewery.fermentation_reading_due_hours), daysToPackage: String(brewery.days_to_package),
    booksOpenedOn: brewery.books_opened_on ?? "",
  };
}

export function readingDueHoursIsValid(hours: number): boolean {
  return Number.isInteger(hours) && hours >= 1 && hours <= 168;
}

export function breweryOperatingDefaultsCommand(values: Pick<BrewerySettingsValues, "hours" | "daysToPackage">) {
  const readingDueHours = Number(values.hours);
  const daysToPackage = Number(values.daysToPackage);
  return {
    name: "set_brewery_operating_defaults",
    input: { readingDueHours, daysToPackage },
    valid: readingDueHoursIsValid(readingDueHours)
      && Number.isInteger(daysToPackage) && daysToPackage >= 1 && daysToPackage <= 120,
  };
}

/** Compare the values sent by Settings, not harmless whitespace or numeric formatting. */
export function brewerySettingsReason(values: BrewerySettingsValues, initial: BrewerySettingsValues): string | null {
  const missing: string[] = [];
  if (!values.name.trim()) missing.push("a brewery name");
  if (!values.timezone.trim()) missing.push("a timezone");
  if (phoneError(values.phone)) missing.push("a phone number, such as (503) 555-0142");
  const { readingDueHours, daysToPackage } = breweryOperatingDefaultsCommand(values).input;
  if (!readingDueHoursIsValid(readingDueHours)) missing.push("reading overdue hours from 1 to 168 (whole numbers)");
  if (!Number.isInteger(daysToPackage) || daysToPackage < 1 || daysToPackage > 120) missing.push("days to package from 1 to 120 (whole numbers)");
  if (missing.length) return submitReason(missing);
  const changed = (Object.keys(values) as (keyof BrewerySettingsValues)[]).some(key => {
    if (key === "hours" || key === "daysToPackage") return Number(values[key]) !== Number(initial[key]);
    return values[key].trim() !== initial[key].trim();
  });
  return submitReason(changed ? [] : ["a change to brewery details"]);
}

/** Server refreshes may arrive between independent writes. Keep locally edited fields. */
export function refreshBrewerySettingsValues(previous: BrewerySettingsValues, values: BrewerySettingsValues, initial: BrewerySettingsValues): BrewerySettingsValues {
  const refreshed = { ...values };
  for (const key of Object.keys(initial) as (keyof BrewerySettingsValues)[]) {
    if (values[key] === previous[key]) refreshed[key] = initial[key];
  }
  return refreshed;
}

/** What Settings may know about the brewery's TypeSafe key (get_brewery_suggestion_settings):
 *  never the key, at most its last four characters, plus the suggestion switch. */
export type TypeSafeKeyStatus = {
  saved: boolean; last4: string | null; enabled: boolean;
  /** The last 30 days of kind suggestions; the read carries it, a key or switch save does not. */
  outcomes?: SuggestionOutcomes;
};

/** How this brewery's kind suggestions turned out (get_material_kind_suggestion_outcomes): names asked,
 *  names that got a suggestion, and of those saved as a material, how many kept that kind or have another. */
export type SuggestionOutcomes = { asked: number; suggested: number; kept: number; changed: number };

/** The Settings line for those counts, or null while no name has been asked. */
export function suggestionOutcomesLine(outcomes: SuggestionOutcomes | undefined): string | null {
  if (!outcomes || outcomes.asked === 0) return null;
  return `${outcomes.suggested} of ${outcomes.asked} names got a suggestion · ${outcomes.kept} kept · ${outcomes.changed} changed`;
}

export type SettingsViewModel = {
  backHref?: string;
  name: string;
  timezone: string;
  timezoneOptions: string[];
  ttb: string;
  phone: string;
  overdueHours: string;
  daysToPackage: string;
  /** The day compliance reports start counting (YYYY-MM-DD), or "" when unset. */
  booksOpenedOn: string;
  hasFiledReports?: boolean;
  basisCorrections?: ReportingBasisCorrection[];
  aiModel: string;
  aiModels: GatewayModelOption[];
  /** Whether outside agents such as Claude or ChatGPT may connect. */
  agentsEnabled: boolean;
  /** The TypeSafe key status and the "Suggest kinds for new materials" switch. */
  suggestions: TypeSafeKeyStatus;
  deployment: string;
  /** Portal fulfillment location id, or null when none is set. */
  warehouseId: string | null;
  warehouseOptions: { id: string; name: string }[];
  locations: string;
  team: string;
  /** The brewery gravity unit chips; live passes GravityUnitForm in their place. */
  units?: UnitsViewModel;
};

/**
 * The set_books_opened_on input for a form save, or undefined when the date did
 * not change. It is its own command (refused after a filed period), so the form
 * sends it only on change and a refused date never blocks the other fields.
 */
export function booksOpenedChange(before: string, after: string): { booksOpenedOn: string | null } | undefined {
  if (before === after) return undefined;
  return { booksOpenedOn: after || null };
}
