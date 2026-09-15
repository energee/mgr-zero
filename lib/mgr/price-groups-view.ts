// lib/mgr/price-groups-view.ts — view-model for the Price groups grid.
// list_sale_channels × list_price_groups × list_formats, filled from
// list_channel_prices. Every format is a column on every channel, as the live
// grid draws it: an unpriced format still needs a cell to tap. A cell is the
// money string, or null when unpriced; the view draws the label. Ids ride
// along so the live page can hang its forms on the same table.
import { money } from "./money";

export type PriceGroupsRowView = { id: string; name: string; cells: (string | null)[] };

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
  formats: { id: string; name: string; brands?: { name: string } | null }[];
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

/** Map the four list_* pricing queries onto PriceGroupsView tables. */
export function toPriceGroupsViewProps({ channels, groups, formats, cells }: PriceGroupsSnapshot): PriceGroupsViewModel {
  const byKey = new Map(cells.map((c) => [cellKey(c.sale_channel_id, c.price_group_id, c.format_id), c.unit_price_cents]));
  return {
    formats: formats.map(formatLabel),
    groupCount: groups.length,
    channels: channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      rows: groups.map((group) => ({
        id: group.id,
        name: group.name,
        cells: formats.map((format) => {
          const cents = byKey.get(cellKey(channel.id, group.id, format.id));
          return cents === undefined ? null : money(cents);
        }),
      })),
    })),
  };
}
