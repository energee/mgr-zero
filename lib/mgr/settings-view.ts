// lib/mgr/settings-view.ts — view-model for Settings (get_brewery extras).
import type { GatewayModelOption } from "@/lib/chat/models";
import { toCents } from "@/lib/mgr/money";

export type SettingsViewModel = {
  backHref?: string;
  name: string;
  timezone: string;
  timezoneOptions: string[];
  ttb: string;
  paLicense: string;
  phone: string;
  overdueHours: string;
  /** The day compliance reports start counting (YYYY-MM-DD), or "" when unset. */
  booksOpenedOn: string;
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

/**
 * The set_one_way_keg_fee input for a form save, or undefined when the fee did
 * not change. A cleared field reads as no fee (0 cents).
 */
export function oneWayKegFeeChange(beforeCents: number, after: string): { feeCents: number } | undefined {
  const feeCents = toCents(after) ?? 0;
  return feeCents === beforeCents ? undefined : { feeCents };
}
