// lib/mgr/labels.ts — one humanizer for every enum an operator reads.
// Database values are snake_case (or already spaced, as the record-movement
// fixtures are); operators see sentence case. Issue #333.
import type { ImportKind } from "@/lib/import-csv";
import { COUNTRY_CODES, COUNTRY_NAMES, CUSTOMER_TYPES, LOCATION_USES, STAFF_ROLES, type BrandSort, type CountryCode, type PaymentMethod, type PaymentTerm } from "@/lib/mgr/enums";

/** "opening_balance" / "opening balance" → "Opening balance". */
export const sentenceCase = (value: string) =>
  value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

/** A member's roles as staff read them, in STAFF_ROLES order: ["warehouse", "admin"] → "Admin, Warehouse". */
export const staffRolesLabel = (roles: readonly string[]) =>
  STAFF_ROLES.filter((role) => roles.includes(role)).map(sentenceCase).join(", ");

/** Import kinds carry product names the humanizer cannot derive; the staff
 *  guide's Kind column is the source of truth. */
export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  customers: "Customers",
  ship_tos: "Ship-tos",
  products_skus: "Products / SKUs",
  channel_prices: "Channel prices",
  opening_balances: "Opening balances",
};

export const importKindLabel = (kind: ImportKind) => IMPORT_KIND_LABELS[kind];

/** How a payment term reads ("net30" → "Net 30"); the stored values are PAYMENT_TERMS in lib/mgr/enums.ts. */
export const PAYMENT_TERM_LABEL: Record<PaymentTerm, string> = { due_on_receipt: "Due on receipt", net15: "Net 15", net30: "Net 30" };

/** A stored payment term as the operator reads it; an unknown value prints as stored. */
export const paymentTermLabel = (term: string) => PAYMENT_TERM_LABEL[term as PaymentTerm] ?? term;

/** How an invoice payment's method reads; the stored values are PAYMENT_METHODS in lib/mgr/enums.ts (#1045). */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = { cash: "Cash", check: "Check", ach: "ACH", other: "Other" };

/** How a QuickBooks or Square connection state reads as a status (qbo_connections / pos_connections.state).
 *  "Reconnect required" names what recovery_required asks the admin to do (#1151). */
const CONNECTION_STATE_LABEL: Record<string, string> = { connected: "Connected", disconnected: "Not connected", recovery_required: "Reconnect required" };

/** A stored connection state as a status; the check constraints allow only the three above, so the
 *  sentence-case fallback only keeps a future state readable until it gets its own label. */
export const connectionStateLabel = (state: string) => CONNECTION_STATE_LABEL[state] ?? sentenceCase(state);

/** Catalog's Sort options, in BRAND_SORTS order (lib/mgr/enums.ts). */
export const BRAND_SORT_LABEL: Record<BrandSort, string> = { name: "Name", abv: "ABV", newest: "Newest" };

/** No saved COLA is evidence only of what is on file, not an approval application or requirement. */
export const COLA_NOT_ON_FILE = "None on file";

/** A record as staff see it: its name, then its staff-only alias when it has one
 *  ("Appaloosa · Animal #14", "Cedar Trading · Evergreen Beer"). Brands and customers. */
export const nameWithAlias = (r: { name: string; alias?: string | null }) => (r.alias ? `${r.name} · ${r.alias}` : r.name);

/** A stored country code as staff read it ("JP" → "Japan"); an unknown code prints as stored. */
export const countryName = (code: string) => COUNTRY_NAMES[code as CountryCode] ?? code;

/** The country picker's options, by name; the stored value is the code (COUNTRY_CODES). */
export const COUNTRY_OPTIONS = COUNTRY_CODES.map((value) => ({ value, label: COUNTRY_NAMES[value] }))
  .sort((a, b) => a.label.localeCompare(b.label, "en"));

/** The customer Type picker's options, shared by New customer and Customer detail; the stored value is the enum. */
export const CUSTOMER_TYPE_OPTIONS = CUSTOMER_TYPES.map((value) => ({ value, label: sentenceCase(value) }));

/** The location Uses picker's options; the stored value is the location_kind enum. */
export const LOCATION_USE_OPTIONS = LOCATION_USES.map((value) => ({ value, label: sentenceCase(value) }));

/** A location's uses as staff read them: ["storage", "taproom"] → "Storage · Taproom". */
export const locationUsesLabel = (uses: readonly string[]) => uses.map(sentenceCase).join(" · ");

/** The generic name stays readable year-round; the IANA identifier stays exact. */
export function timezoneLabel(timezone: string): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longGeneric" })
      .formatToParts(new Date("2026-01-01T12:00:00Z")).find((part) => part.type === "timeZoneName")!.value;
    return `${name} (${timezone})`;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Keep an invalid value visible for correction; validation still blocks saving it.
    return `${timezone} (invalid timezone)`;
  }
}
