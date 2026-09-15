// lib/mgr/price-group-view.ts — view-model for one Price group row. Name,
// position and cost ceiling come from list_price_groups; the Prices line
// summarises list_channel_prices for that group. Without a groupId it is the
// same row before it exists (the create form): blank name, next position,
// under the last group's ceiling, no Prices line.
import { dollarsInput, money } from "./money";
import { plural } from "./plural";
import { byPosition, formatLabel, type PriceGroupRow, type PriceGroupsSnapshot } from "./price-groups-view";

export type PriceGroupViewModel = {
  backHref?: string;
  name: string;
  position: string;
  costCeiling: string;
  costCeilingInput: string;
  previousCeilingLabel?: string;
  previousCeiling?: string;
  /** Absent on a group that does not exist yet (the create form). */
  prices?: string;
  /** Absent on the create form, which has nothing to remove. */
  removeDetail?: string;
  /** Pours this group owns. Absent on the create form. */
  pours?: { id: string; name: string; ounces: string }[];
};

export type PriceGroupSnapshot = PriceGroupsSnapshot & { groupId?: string };

function pricesSummary(snapshot: PriceGroupsSnapshot, groupId: string): string {
  const priced = snapshot.cells.filter((c) => c.price_group_id === groupId);
  const first = priced[0];
  if (!first) return "none";
  const channel = snapshot.channels.find((c) => c.id === first.sale_channel_id)?.name ?? "";
  const format = snapshot.formats.find((f) => f.id === first.format_id);
  const head = `${money(first.unit_price_cents)} on ${channel} · ${format ? formatLabel(format) : ""}`;
  const rest = priced.length - 1;
  return rest > 0 ? `${head}, and ${plural(rest, "more cell")}` : head;
}

/** Map one list_price_groups row (or none, for the create form) plus its grid cells onto PriceGroupView. */
export function toPriceGroupViewProps(snapshot: PriceGroupSnapshot): PriceGroupViewModel {
  const ordered = [...snapshot.groups].sort(byPosition);
  const index = snapshot.groupId === undefined ? ordered.length : ordered.findIndex((g) => g.id === snapshot.groupId);
  const group: PriceGroupRow | undefined = ordered[index];
  if (snapshot.groupId !== undefined && !group) throw new Error("price group not found");
  const previous = ordered[index - 1];
  return {
    backHref: snapshot.backHref,
    name: group?.name ?? "",
    position: String(group?.position ?? ordered.length + 1),
    costCeiling: group?.cost_ceiling_cents == null ? "" : money(group.cost_ceiling_cents),
    costCeilingInput: dollarsInput(group?.cost_ceiling_cents),
    previousCeilingLabel: previous && `Cost ceiling · group ${previous.name}`,
    previousCeiling: previous && (previous.cost_ceiling_cents == null ? "none" : money(previous.cost_ceiling_cents)),
    ...(group && {
      prices: pricesSummary(snapshot, group.id),
      removeDetail: "refused while a brand sits on it, a cell prices it, or it owns a pour",
      pours: snapshot.formats.filter((f) => f.basis === "poured" && f.price_group_id === group.id).map((f) => ({
        id: f.id, name: f.name, ounces: f.ounces != null ? String(f.ounces) : "",
      })),
    }),
  };
}
