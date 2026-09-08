// app/(app)/kegs/keg-labels.ts — the words the Keg fleet pages print for
// keg sizes, pool kinds and event reasons (the enums live in
// lib/commands/taproom.ts; this is only how they read).
export const SIZE_LABEL: Record<string, string> = {
  half_bbl: "½ bbl", quarter_bbl: "¼ bbl", sixth_bbl: "⅙ bbl", fifty_l: "50 L", thirty_l: "30 L", twenty_l: "20 L",
};
export const KIND_LABEL: Record<string, string> = { owned: "Owned", leased: "Leased", pay_per_fill: "Pay per fill" };
export const REASON_LABEL: Record<string, string> = {
  acquired: "Acquired", retired: "Retired", shipped: "Shipped", returned: "Returned", lost: "Lost", found: "Found",
  transferred_out: "Transferred out", transferred_in: "Transferred in",
};
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
