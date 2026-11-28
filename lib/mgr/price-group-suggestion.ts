// lib/mgr/price-group-suggestion.ts — which price group a brand's recipe cost
// points at. Ceilings are $/bbl on price_groups (a stored threshold); the
// cost is recipe_version_costs (each ingredient at its last receipt cost, else
// the material's typed price; derived, never stored). Groups sort by position,
// those without a ceiling are skipped, and the first ceiling at or above the
// cost is the band. Ceilings need not rise
// with position, so a band is not "above the previous group's ceiling".
// Nothing here assigns: the Brand page offers Use and a person confirms.
import { money } from "./money";
import type { RecipeVersionCost } from "@/lib/commands/recipe-cost";
import { uncostedText, unreceivedText } from "./recipe-cost-view";
import { byPosition, type PriceGroupRow } from "./price-groups-view";

/** The brand's recipe cost (null cost when it has no recipe) and the groups to band it in. An uncosted ingredient
 *  means the sum omits it and cannot be trusted; an unreceived one is named beside the cost. */
export type SuggestionInput = RecipeVersionCost & { groups: PriceGroupRow[] };

export type PriceGroupSuggestion =
  | { kind: "group"; groupId: string; title: string; detail: string }
  | { kind: "above" | "cost" | "unknown"; title: string; detail: string };

const perBbl = (cents: number) => `${money(cents)}/bbl`;

export function suggestPriceGroup({ costCentsPerBbl, uncosted, unreceived, groups }: SuggestionInput): PriceGroupSuggestion | null {
  if (uncosted.length) return { kind: "unknown", title: "Recipe cost unknown", detail: uncostedText(uncosted) };
  if (costCentsPerBbl == null) return null;
  const cost = `Recipe cost ${perBbl(costCentsPerBbl)}`;
  const typed = unreceived.length ? ` · ${unreceivedText(unreceived)}` : "";
  const banded = [...groups].sort(byPosition).flatMap((g) => g.cost_ceiling_cents == null ? [] : [{ id: g.id, name: g.name, ceiling: g.cost_ceiling_cents }]);
  if (!banded.length) return { kind: "cost", title: cost, detail: `No price group has a ceiling.${typed}` };
  const hit = banded.find((g) => g.ceiling >= costCentsPerBbl);
  if (!hit) return { kind: "above", title: "Above every ceiling", detail: `${cost} · highest ceiling ${perBbl(Math.max(...banded.map((g) => g.ceiling)))}${typed}` };
  return { kind: "group", groupId: hit.id, title: `Suggested group ${hit.name}`, detail: `${cost} · ceiling ${perBbl(hit.ceiling)}${typed}` };
}
