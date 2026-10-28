// lib/mgr/settings-view.ts — view-model for Settings (get_brewery extras).
import type { GatewayModelOption } from "@/lib/chat/models";
import { dollarsInput, toCents } from "@/lib/mgr/money";
import type { ReportingBasisCorrection } from "@/lib/commands/compliance";
import { submitReason } from "@/lib/mgr/submit-reason";
import { phoneError } from "@/lib/mgr/phone";

export type BrewerySettings = {
  name: string; timezone: string; ttb_registry_no: string | null; pa_license_no: string | null;
  customer_phone: string | null; fermentation_reading_due_hours: number; days_to_package: number;
  books_opened_on: string | null; one_way_keg_fee_cents: number;
};

export type BrewerySettingsValues = {
  name: string; timezone: string; ttb: string; pa: string; phone: string; hours: string;
  daysToPackage: string; booksOpenedOn: string; oneWayKegFee: string;
};

export function toBrewerySettingsValues(brewery: BrewerySettings): BrewerySettingsValues {
  return {
    name: brewery.name, timezone: brewery.timezone, ttb: brewery.ttb_registry_no ?? "",
    pa: brewery.pa_license_no ?? "", phone: brewery.customer_phone ?? "",
    hours: String(brewery.fermentation_reading_due_hours), daysToPackage: String(brewery.days_to_package),
    booksOpenedOn: brewery.books_opened_on ?? "", oneWayKegFee: dollarsInput(brewery.one_way_keg_fee_cents),
  };
}

export function readingDueHoursIsValid(hours: number): boolean {
  return Number.isInteger(hours) && hours >= 1 && hours <= 168;
}

export function readingCadenceReason(hours: string, initial: number): string | null {
  const value = Number(hours);
  if (!readingDueHoursIsValid(value)) return submitReason(["reading overdue hours from 1 to 168 (whole numbers)"]);
  return submitReason(value === initial ? ["a change to reading cadence"] : []);
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
    if (key === "oneWayKegFee") return (toCents(values[key]) ?? 0) !== (toCents(initial[key]) ?? 0);
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

export function aiModelSettingsReason(value: string, initial: string, models: GatewayModelOption[]): string | null {
  if (!models.length) return submitReason(["the Gateway model catalog"]);
  if (value === initial) return submitReason(["a change to the AI model"]);
  return submitReason(models.some(model => model.id === value) ? [] : ["an available AI model"]);
}

export type SettingsViewModel = {
  backHref?: string;
  name: string;
  timezone: string;
  timezoneOptions: string[];
  ttb: string;
  paLicense: string;
  phone: string;
  overdueHours: string;
  daysToPackage: string;
  /** The day compliance reports start counting (YYYY-MM-DD), or "" when unset. */
  booksOpenedOn: string;
  hasFiledReports?: boolean;
  basisCorrections?: ReportingBasisCorrection[];
  /** The one-way keg fee in dollars ("10.00"); "0.00" bills none. */
  oneWayKegFee: string;
  aiModel: string;
  aiModels: GatewayModelOption[];
  deployment: string;
  /** Portal fulfillment location id, or null when none is set. */
  warehouseId: string | null;
  warehouseOptions: { id: string; name: string }[];
  locations: string;
  team: string;
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

/** Match the fee's nonnegative integer-cent storage without rounding typed fractions. */
export function oneWayKegFeeError(value: string): string | undefined {
  if (value === "") return undefined;
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
    || (value.split(".")[1]?.replace(/0+$/, "").length ?? 0) > 2) {
    return "Enter zero or a positive dollar amount with at most two decimal places.";
  }
  if ((toCents(value) ?? 0) > 2_147_483_647) return "Enter a fee of $21,474,836.47 or less.";
  return undefined;
}

/**
 * The set_one_way_keg_fee input for a form save, or undefined when the fee did
 * not change. A cleared field reads as no fee (0 cents).
 */
export function oneWayKegFeeChange(beforeCents: number, after: string): { feeCents: number } | undefined {
  const feeCents = toCents(after) ?? 0;
  return feeCents === beforeCents ? undefined : { feeCents };
}
