// lib/mgr/keg-labels.ts — the words the keg pages and adapters print for
// keg sizes, pool kinds and event reasons (the values live in
// lib/mgr/enums.ts; this is only how they read). A dollar figure comes from
// money() in lib/mgr/money.ts.
import type { KegEventReason } from "./keg-fleet-view";

export const SIZE_LABEL: Record<string, string> = {
  half_bbl: "½ bbl", quarter_bbl: "¼ bbl", sixth_bbl: "⅙ bbl", fifty_l: "50 L", thirty_l: "30 L", twenty_l: "20 L",
};
export const KIND_LABEL: Record<string, string> = { owned: "Owned", leased: "Leased", pay_per_fill: "Pay per fill" };
export const REASON_LABEL: Record<string, string> = {
  acquired: "Acquired", retired: "Retired", shipped: "Shipped", returned: "Returned", lost: "Lost", found: "Found",
  transferred_out: "Transferred out", transferred_in: "Transferred in",
};
/** What each manual Record keg event reason does to the shells, shown under
 *  the Reason picker. The staff guide's "Record a keg event" says the same. */
export const REASON_EFFECT: Record<KegEventReason, string> = {
  acquired: "Adds kegs to the fleet in this bin.",
  retired: "Removes kegs from the fleet and this bin.",
  shipped: "Moves empty kegs from this bin to the customer. The fleet total does not change.",
  returned: "Moves empty kegs from the customer into this bin. The fleet total does not change.",
  lost: "Removes kegs from the fleet. With a customer they come off that customer’s balance; without one, out of this bin.",
  found: "Adds kegs back to the fleet in this bin. A keg back from a customer is Returned, not Found.",
};
