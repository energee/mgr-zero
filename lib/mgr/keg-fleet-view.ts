// lib/mgr/keg-fleet-view.ts — view-model for Keg fleet: the pool and event
// form values both the inventory and the live forms draw through
// components/mgr/views/keg-fleet.tsx, and the rules those forms share.
import { SIZE_LABEL } from "./keg-labels";
import type { EmptyState } from "./empty-state";
import type { KEG_EVENT_REASONS, KEG_POOL_KINDS, KEG_SIZES } from "./enums";
import { centsMaxError } from "./money";
import { isNumber, numberNotationError } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type KegFleetBinRow = { key: string; title: string; detail: string; qty: string };
export type KegFleetPoolRow = { key: string; title: string; detail: string; bins: KegFleetBinRow[] };
export type KegFleetNavRow = { key: string; href: string; title: string; detail: string };
export type KegOption = { value: string; label: string };
/** A named row as a picker option. */
export const toKegOption = (r: { id: string; name: string }): KegOption => ({ value: r.id, label: r.name });

export type KegPoolKind = (typeof KEG_POOL_KINDS)[number];
export type KegSize = (typeof KEG_SIZES)[number];
export type KegEventReason = (typeof KEG_EVENT_REASONS)[number];

/** The Add/Edit keg pool fields, as text the fields hold (dollars, not cents). */
export type KegPoolValue = { name: string; kind: KegPoolKind; vendorId: string; perFill: string; deposit: string; active: boolean };
/** The Record keg event fields. */
export type KegEventValue = { poolId: string; kegSize: KegSize; reason: KegEventReason; locationId: string; binId: string; customerId: string; qty: string; note: string };
/** The pickers' options. `bins` are already the chosen location's bins. `onHand` is how many kegs of the chosen
 *  pool and size the event can take (kegOnHand): the chosen customer's when it takes kegs from a customer, else the
 *  chosen bin's; it is left out where that is not known (the inventory fixture). */
export type KegEventOptions = { pools: KegOption[]; locations: KegOption[]; bins: KegOption[]; customers: KegOption[]; onHand?: number };

export type KegFleetViewModel = {
  shortages?: string[];
  backHref?: string;
  pools?: KegFleetPoolRow[];
  bins?: KegFleetBinRow[];
  empty?: EmptyState;
  navRows?: KegFleetNavRow[];
  customerBalance?: string;
  report?: string;
  history?: string;
  /** Inventory only: the pool form drawn inline, and its vendor options. */
  poolForm?: KegPoolValue;
  vendors?: KegOption[];
  /** Inventory only: initial values for the shared event dialog/sheet. */
  eventForm?: KegEventValue;
  eventOptions?: KegEventOptions;
  /** Why Record keg event is not offered; the view draws it in place of the form. */
  eventUnavailable?: string | null;
};

const NO_POOLS: EmptyState = { title: "No keg pools yet", description: "A pool groups the kegs of one size and owner." };

/** Identity but for the blank: the pools list is the only thing this screen
 *  can be empty of, and the words for that belong here, not in the page. */
export function toKegFleetViewProps(s: KegFleetViewModel): KegFleetViewModel {
  if (!s.pools || s.pools.length) return s;
  return { ...s, empty: s.empty ?? NO_POOLS };
}

/** Shipped and returned move kegs to or from a customer, so they name one. */
export const needsKegCustomer = (r: KegEventReason) => r === "shipped" || r === "returned";
/** Lost may name the customer the kegs were lost at; found never does. */
export const mayHaveKegCustomer = (r: KegEventReason) => needsKegCustomer(r) || r === "lost";

/** The next Record keg event value. A changed location takes `firstBin(location)`
 *  (live: that location's first bin; inventory: none), so a bin never outlives
 *  the location it belongs to. */
export const withLocationBin = (prev: KegEventValue, next: KegEventValue, firstBin: (locationId: string) => string): KegEventValue =>
  next.locationId !== prev.locationId ? { ...next, binId: firstBin(next.locationId) } : next;

type KegBinStock = Pick<KegEventOptions, "bins" | "customers" | "onHand">;
/** A keg count is typed as plain digits, at least 1. */
const isKegCount = (qty: string) => /^\d+$/.test(qty) && Number.isSafeInteger(Number(qty)) && Number(qty) > 0;
/** Retired, shipped, and lost with no customer take kegs out of the chosen bin, so record_keg_event checks the bin holds them. */
const takesFromBin = (v: KegEventValue) => v.reason === "retired" || v.reason === "shipped" || (v.reason === "lost" && !v.customerId);
/** Returned, and lost at a customer, take kegs from that customer, so record_keg_event checks the customer holds them. */
const takesFromCustomer = (v: KegEventValue) => (v.reason === "returned" || v.reason === "lost") && Boolean(v.customerId);

/** get_keg_fleet's rows: kegs one bin holds, and kegs one customer holds, of one pool and size. */
type KegBinRow = { pool_id: string; keg_size: string; bin_id: string; qty: number };
type KegCustomerRow = { customer_id: string; pool_id: string; keg_size: string; qty: number };

/** How many kegs of the chosen pool and size the event can take: the chosen customer's balance when it takes kegs from
 *  a customer, else the chosen bin's when it takes them from a bin. A customer or bin with no row holds none. Undefined
 *  when the event takes no kegs, or its customer or bin is not chosen yet. */
export function kegOnHand(v: KegEventValue, stock: KegBinRow[], balances: KegCustomerRow[]): number | undefined {
  const ofKeg = (r: { pool_id: string; keg_size: string }) => r.pool_id === v.poolId && r.keg_size === v.kegSize;
  if (takesFromCustomer(v)) return balances.find((r) => ofKeg(r) && r.customer_id === v.customerId)?.qty ?? 0;
  if (takesFromBin(v) && v.binId) return stock.find((r) => ofKeg(r) && r.bin_id === v.binId)?.qty ?? 0;
  return undefined;
}

/** "at most 8 kegs in Cold", or "at most 4 kegs at Ridgeline", when a count taken from a bin or a customer is more
 *  than `onHand`; undefined otherwise, or when `onHand` is not known. */
function stockLimit(v: KegEventValue, options?: KegBinStock): string | undefined {
  if (options?.onHand === undefined || !isKegCount(v.qty) || Number(v.qty) <= options.onHand) return undefined;
  if (takesFromCustomer(v)) return `at most ${options.onHand} kegs at ${options.customers.find((c) => c.value === v.customerId)?.label ?? "that customer"}`;
  if (takesFromBin(v)) return `at most ${options.onHand} kegs in ${options.bins.find((b) => b.value === v.binId)?.label ?? "that bin"}`;
  return undefined;
}

/** Field errors also own readiness, so invalid typed values never enable submit. With `options.onHand`, a count
 *  taken from a bin or a customer is held to the kegs it holds, as record_keg_event refuses more. */
export function kegEventFieldErrors(v: KegEventValue, options?: KegBinStock): Partial<Record<keyof KegEventValue, string>> {
  const errors: Partial<Record<keyof KegEventValue, string>> = {};
  if (!v.poolId) errors.poolId = "Choose a keg pool.";
  if (!v.locationId) errors.locationId = "Choose a location.";
  if (!v.binId) errors.binId = "Choose a bin.";
  if (needsKegCustomer(v.reason) && !v.customerId) errors.customerId = "Choose a customer.";
  const notation = numberNotationError(v.qty);
  if (notation) errors.qty = notation;
  else if (!isKegCount(v.qty)) errors.qty = "Enter a whole number of kegs, at least 1.";
  else {
    const limit = stockLimit(v, options);
    if (limit) errors.qty = `Enter ${limit}.`;
  }
  return errors;
}

/** The same field errors also name what Record keg event still needs. */
export function kegEventReason(v: KegEventValue, options?: KegBinStock): string | null {
  const errors = kegEventFieldErrors(v, options);
  return submitReason([
    errors.poolId && "a keg pool", errors.locationId && "a location", errors.binId && "a bin",
    errors.qty && (stockLimit(v, options) ?? "a whole keg count of at least 1 (no exponent notation)"), errors.customerId && "a customer",
  ].filter((need): need is string => Boolean(need)));
}

/** Optional money stays optional, but a filled value must be dollars and cents the int-cent column holds. */
function kegMoneyError(value: string): string | undefined {
  if (value === "") return undefined;
  const notation = numberNotationError(value);
  if (notation) return notation;
  if (!isNumber(value) || Number(value) < 0) return "Enter an amount of zero or more.";
  if ((value.trim().split(".")[1]?.length ?? 0) > 2) return "Enter dollars and cents, with at most two decimal places.";
  return centsMaxError(value, "an amount");
}

/** Add and Edit use the same money rules, including optional blank deposits. */
export function kegPoolFieldErrors(v: KegPoolValue): Partial<Record<keyof KegPoolValue, string>> {
  const errors: Partial<Record<keyof KegPoolValue, string>> = {};
  if (!v.name.trim()) errors.name = "Enter a pool name.";
  if (v.kind !== "owned" && !v.vendorId) errors.vendorId = "Choose a vendor.";
  const perFill = kegMoneyError(v.perFill);
  const deposit = kegMoneyError(v.deposit);
  if (perFill) errors.perFill = perFill;
  else if (v.kind === "pay_per_fill" && v.perFill === "") errors.perFill = "Enter the per-fill cost.";
  if (deposit) errors.deposit = deposit;
  return errors;
}

/** Why Record keg event is not offered, or null when it is: an event needs a pool in service and a location. */
export function kegEventUnavailable({ activePools, locations }: { activePools: number; locations: number }): string | null {
  const missing = [activePools ? null : "a keg pool in service", locations ? null : "a location"].filter(Boolean);
  return missing.length ? `Recording a keg event needs ${missing.join(" and ")}.` : null;
}

/** A pool/size whose recorded shells at one location net below zero; saved by
 *  ship_order and read from keg_location_shortages, so both screens agree. */
export type KegShortage = { pool: string; keg_size: string; location: string; short: number };

/** The one wording staff see for a shell shortage, on Shipment done and Keg fleet. */
export function kegShortageText({ pool, keg_size, location, short }: KegShortage): string {
  return `${pool} ${SIZE_LABEL[keg_size] ?? keg_size} · ${location}: ${short} kegs short · record Acquired kegs to reconcile`;
}
