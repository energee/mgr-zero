// lib/mgr/settings-view.ts — view-model for Settings (get_brewery extras).
import type { GatewayModelOption } from "@/lib/chat/models";

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
