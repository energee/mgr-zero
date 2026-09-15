// lib/mgr/price-group-view.ts — view-model for one Price group row. Name,
// position and cost ceiling come from list_price_groups; the Prices line
// summarises list_channel_prices for that group. toNewPriceGroupViewProps is
// the same row before it exists: blank name, next position, no Prices line.
import { money } from "./money";
import { plural } from "./plural";
import { byPosition, type PriceGroupRow, type PriceGroupsSnapshot } from "./price-groups-view";

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
  removeDetail: string;
};

const ceilingLabel = (g: PriceGroupRow) => `Cost ceiling · group ${g.name}`;
const ceilingText = (g: PriceGroupRow) => g.cost_ceiling_cents == null ? "none" : money(g.cost_ceiling_cents);

/** The create form: a blank row placed after the last group, under its ceiling. */
export function toNewPriceGroupViewProps(snapshot: PriceGroupsSnapshot): PriceGroupViewModel {
  const previous = [...snapshot.groups].sort(byPosition).at(-1);
  return {
    name: "",
    position: String(snapshot.groups.length + 1),
    costCeiling: "",
    costCeilingInput: "",
    previousCeilingLabel: previous && ceilingLabel(previous),
    previousCeiling: previous && ceilingText(previous),
    removeDetail: "",
  };
}

export type PriceGroupSnapshot = PriceGroupsSnapshot & { groupId: string };

function pricesSummary(snapshot: PriceGroupSnapshot, groupId: string): string {
  const priced = snapshot.channels.flatMap((channel) =>
    snapshot.formats.flatMap((format) => {
      const cell = snapshot.cells.find(
        (c) =>
          c.sale_channel_id === channel.id &&
          c.price_group_id === groupId &&
          c.format_id === format.id,
      );
      return cell
        ? [{ cents: cell.unit_price_cents, channel: channel.name, format: format.name }]
        : [];
    }),
  );
  const first = priced[0];
  if (!first) return "none";
  const head = `${money(first.cents)} on ${first.channel} · ${first.format}`;
  const rest = priced.length - 1;
  return rest > 0 ? `${head}, and ${plural(rest, "more cell")}` : head;
}

/** Map one list_price_groups row plus its grid cells onto PriceGroupView. */
export function toPriceGroupViewProps(snapshot: PriceGroupSnapshot): PriceGroupViewModel {
  const ordered = [...snapshot.groups].sort(byPosition);
  const index = ordered.findIndex((g) => g.id === snapshot.groupId);
  const group = ordered[index];
  if (!group) throw new Error("price group not found");
  const previous = index > 0 ? ordered[index - 1] : undefined;
  return {
    backHref: snapshot.backHref,
    name: group.name,
    position: String(group.position),
    costCeiling: group.cost_ceiling_cents == null ? "" : money(group.cost_ceiling_cents),
    costCeilingInput: group.cost_ceiling_cents == null ? "" : (group.cost_ceiling_cents / 100).toFixed(2),
    previousCeilingLabel: previous && ceilingLabel(previous),
    previousCeiling: previous && ceilingText(previous),
    prices: pricesSummary(snapshot, group.id),
    removeDetail: "refused while a brand sits on it or a cell prices it",
  };
}
