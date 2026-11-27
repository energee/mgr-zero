// lib/mgr/pallet-rules-view.ts — view-model for the Pallets section of
// Settings: the brewery's pallet rules (breweries.pallet_rules) as form text,
// and the set_pallet_rules payload with the reason it is withheld.
import type { PalletRules } from "./pallet-fit";
import { whole } from "./release-settings-view";
import { submitReason } from "./submit-reason";

/** The section's fields as typed text; a keg layer is a count per keg size, "" for none. */
export type PalletRulesValues = { maxLb: string; maxHeightIn: string; palletHeightIn: string; kegLayers: Record<string, string>[] };

export function toPalletRulesValues(rules: PalletRules): PalletRulesValues {
  return {
    maxLb: String(rules.maxLb), maxHeightIn: String(rules.maxHeightIn), palletHeightIn: String(rules.palletHeightIn),
    kegLayers: rules.kegLayers.map((row) => Object.fromEntries(Object.entries(row).map(([size, count]) => [size, String(count)]))),
  };
}

/** set_pallet_rules for the typed values; `reason` withholds Save until every field is in range and something changed. */
export function palletRulesCommand(values: PalletRulesValues, initial: PalletRulesValues) {
  // A blank or zero cell means none of that size in the layer.
  const cells = values.kegLayers.map((row) => Object.entries(row).filter(([, count]) => count.trim() !== "" && Number(count) !== 0));
  const missing = [
    ...(whole(values.maxLb, 1, 10000) ? [] : ["a pallet weight from 1 to 10,000 lb"]),
    ...(whole(values.maxHeightIn, 12, 120) ? [] : ["a loaded pallet height from 12 to 120 in"]),
    ...(/^\d+(\.\d)?$/.test(values.palletHeightIn.trim()) && Number(values.palletHeightIn) <= 24 ? [] : ["an empty pallet height from 0 to 24 in, to one decimal"]),
    ...(cells.every((row) => row.length > 0 && row.every(([, count]) => whole(count, 1, 500))) ? [] : ["a whole number of kegs in every keg layer"]),
  ];
  return {
    name: "set_pallet_rules" as const,
    input: {
      maxLb: Number(values.maxLb), maxHeightIn: Number(values.maxHeightIn), palletHeightIn: Number(values.palletHeightIn),
      kegLayers: cells.map((row) => Object.fromEntries(row.map(([size, count]) => [size, Number(count)]))),
    },
    reason: submitReason(missing.length ? missing : JSON.stringify(values) !== JSON.stringify(initial) ? [] : ["a change to the pallet rules"]),
  };
}
