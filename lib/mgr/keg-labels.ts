// lib/mgr/keg-labels.ts — the words the keg pages and adapters print for
// keg sizes, pool kinds and event reasons (the values live in
// lib/mgr/enums.ts; this is only how they read). A dollar figure comes from
// money() in lib/mgr/money.ts.
export const SIZE_LABEL: Record<string, string> = {
  half_bbl: "½ bbl", quarter_bbl: "¼ bbl", sixth_bbl: "⅙ bbl", fifty_l: "50 L", thirty_l: "30 L", twenty_l: "20 L",
};
export const KIND_LABEL: Record<string, string> = { owned: "Owned", leased: "Leased", pay_per_fill: "Pay per fill" };
export const REASON_LABEL: Record<string, string> = {
  acquired: "Acquired", retired: "Retired", shipped: "Shipped", returned: "Returned", lost: "Lost", found: "Found",
  transferred_out: "Transferred out", transferred_in: "Transferred in",
};
