// lib/mgr/price-group-suggestion.ts — which price group a brand's recipe cost
// points at. Ceilings are $/bbl on price_groups (a stored threshold); the
// cost is recipe_version_costs (derived from last receipt costs, never
// stored). Groups sort by position and each ceiling's lower bound is the
// previous group's, so the first ceiling that covers the cost is the band.
// Nothing here assigns: the Brand page offers Use and a person confirms.
import { money } from "./money";

export type SuggestionGroups = { id: string; name: string; position: number; cost_ceiling_cents: number | null }[];

export type SuggestionInput = {
  /** cost_cents_per_bbl of the brand's recipe version, or null when the brand has no recipe. */
  costCentsPerBbl: number | null;
  /** Ingredients with no receipt cost yet: the sum above silently omits them, so it cannot be trusted. */
  uncosted: string[];
  groups: SuggestionGroups;
};

export type PriceGroupSuggestion =
  | { kind: "group"; groupId: string; title: string; detail: string }
  | { kind: "above" | "cost" | "unknown"; title: string; detail: string };

const perBbl = (cents: number) => `${money(cents)}/bbl`;

export function suggestPriceGroup({ costCentsPerBbl, uncosted, groups }: SuggestionInput): PriceGroupSuggestion | null {
  if (uncosted.length) return { kind: "unknown", title: "Recipe cost unknown", detail: `no receipt cost yet for ${uncosted.join(", ")}` };
  if (costCentsPerBbl == null) return null;
  const cost = `recipe cost ${perBbl(costCentsPerBbl)}`;
  const banded = [...groups].sort((a, b) => a.position - b.position).filter((g) => g.cost_ceiling_cents != null);
  if (!banded.length) return { kind: "cost", title: `Recipe cost ${perBbl(costCentsPerBbl)}`, detail: "no price group has a ceiling" };
  const hit = banded.find((g) => g.cost_ceiling_cents! >= costCentsPerBbl);
  if (!hit) return { kind: "above", title: "Above every ceiling", detail: `${cost} · highest ceiling ${perBbl(Math.max(...banded.map((g) => g.cost_ceiling_cents!)))}` };
  return { kind: "group", groupId: hit.id, title: `Suggested group ${hit.name}`, detail: `${cost} · ceiling ${perBbl(hit.cost_ceiling_cents!)}` };
}
