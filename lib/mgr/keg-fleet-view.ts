// lib/mgr/keg-fleet-view.ts — view-model for Keg fleet: the pool and event
// form values both the inventory and the live forms draw through
// components/mgr/views/keg-fleet.tsx, and the rules those forms share.
import type { EmptyState } from "./empty-state";
import type { KEG_EVENT_REASONS, KEG_POOL_KINDS, KEG_SIZES } from "./enums";

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
/** The pickers' options. `bins` are already the chosen location's bins. */
export type KegEventOptions = { pools: KegOption[]; locations: KegOption[]; bins: KegOption[]; customers: KegOption[] };

export type KegFleetViewModel = {
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
  /** Inventory only: the event form drawn inline. */
  eventForm?: KegEventValue;
  eventOptions?: KegEventOptions;
  /** A balance preview the fixture can state; the live form has no per-customer, per-size balance to show. */
  eventPreview?: { qty: number; name: string; from: string; to: string };
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

/** Whether Record keg event can submit: a pool, a bin, a positive count, and a customer when the reason needs one. */
export const kegEventReady = (v: KegEventValue) =>
  Boolean(v.poolId && v.locationId && v.binId && Number(v.qty) > 0 && (!needsKegCustomer(v.reason) || v.customerId));

/** Whether Add/Save keg pool can submit: a name, a vendor unless owned, and a per-fill cost for pay per fill. */
export const kegPoolReady = (v: KegPoolValue) =>
  Boolean(v.name.trim() && (v.kind === "owned" || v.vendorId) && (v.kind !== "pay_per_fill" || v.perFill !== ""));

/** Why Record keg event is not offered, or null when it is: an event needs a pool in service and a location. */
export function kegEventUnavailable({ activePools, locations }: { activePools: number; locations: number }): string | null {
  const missing = [activePools ? null : "a keg pool in service", locations ? null : "a location"].filter(Boolean);
  return missing.length ? `Recording a keg event needs ${missing.join(" and ")}.` : null;
}
