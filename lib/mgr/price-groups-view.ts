// lib/mgr/price-groups-view.ts — view-model for the Price groups grid.
// list_sale_channels × list_price_groups × list_formats, filled from
// list_channel_prices. Packaged formats are one column each. Pours owned by a
// price group share a column by name; a group with no pour of that name has
// no cell. A cell is the money string, or null when unpriced.
import { money } from "./money";

export type PriceGroupsRowView = { id: string; name: string; cells: (string | null)[]; formatIds: (string | null)[] };

export type PriceGroupsChannelView = {
  id: string;
  name: string;
  rows: PriceGroupsRowView[];
};

export type PriceGroupsViewModel = {
  /** Column labels after "Group": the format, prefixed by its brand when it has one. */
  formats: string[];
  /** How many groups exist, so a grid with no channels can still say which is missing. */
  groupCount: number;
  channels: PriceGroupsChannelView[];
};

/** One row of list_price_groups: the grid row and its $/bbl ceiling. */
export type PriceGroupRow = { id: string; name: string; position: number; cost_ceiling_cents: number | null };
export const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

export type PriceGroupsSnapshot = {
  backHref?: string;
  channels: { id: string; name: string }[];
  groups: PriceGroupRow[];
  formats: {
    id: string;
    name: string;
    basis?: "packaged" | "poured";
    ounces?: number | string | null;
    price_group_id?: string | null;
    brands?: { name: string } | null;
    price_groups?: { name: string } | null;
  }[];
  cells: {
    sale_channel_id: string;
    price_group_id: string;
    format_id: string;
    unit_price_cents: number;
  }[];
};

export const cellKey = (channelId: string, groupId: string, formatId: string) => `${channelId}|${groupId}|${formatId}`;

/** A format column's label: "Hazy · ½ bbl keg" when the format belongs to a brand. */
export const formatLabel = (f: PriceGroupsSnapshot["formats"][number]) => f.brands ? `${f.brands.name} · ${f.name}` : f.name;

export function pricingColumns(formats: PriceGroupsSnapshot["formats"]) {
  const packaged = formats.filter((f) => f.basis !== "poured");
  const pourNames = [...new Set(formats.filter((f) => f.basis === "poured").map((f) => f.name))];
  return [
    ...packaged.map((f) => ({ key: f.id, label: formatLabel(f), kind: "packaged" as const, name: f.name, formatId: f.id })),
    ...pourNames.map((name) => ({ key: `pour:${name}`, label: name, kind: "poured" as const, name })),
  ];
}

function formatIdForColumn(
  column: ReturnType<typeof pricingColumns>[number],
  groupId: string,
  formats: PriceGroupsSnapshot["formats"],
): string | null {
  if (column.kind === "packaged") return column.formatId;
  return formats.find((f) => f.basis === "poured" && f.price_group_id === groupId && f.name === column.name)?.id ?? null;
}

/** Map the four list_* pricing queries onto PriceGroupsView tables. */
export function toPriceGroupsViewProps({ channels, groups, formats, cells }: PriceGroupsSnapshot): PriceGroupsViewModel {
  const byKey = new Map(cells.map((c) => [cellKey(c.sale_channel_id, c.price_group_id, c.format_id), c.unit_price_cents]));
  const columns = pricingColumns(formats);
  return {
    formats: columns.map((c) => c.label),
    groupCount: groups.length,
    channels: channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      rows: groups.map((group) => {
        const formatIds = columns.map((column) => formatIdForColumn(column, group.id, formats));
        return {
          id: group.id,
          name: group.name,
          formatIds,
          cells: formatIds.map((formatId) => {
            if (!formatId) return null;
            const cents = byKey.get(cellKey(channel.id, group.id, formatId));
            return cents === undefined ? null : money(cents);
          }),
        };
      }),
    })),
  };
}
