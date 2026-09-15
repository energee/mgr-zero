// lib/mgr/price-groups-view.ts — view-model for the Price groups grid.
// list_sale_channels × list_price_groups × list_formats, filled from
// list_channel_prices. Every format is a column on every channel, as the live
// grid draws it: an unpriced format still needs a cell to tap. Empty cells
// read "not priced".
import { money } from "./money";

export type PriceGroupsChannelView = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

export type PriceGroupsViewModel = {
  channels: PriceGroupsChannelView[];
};

/** One row of list_price_groups: the grid row and its $/bbl ceiling. */
export type PriceGroupRow = { id: string; name: string; position: number; cost_ceiling_cents: number | null };
export const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

export type PriceGroupsSnapshot = {
  backHref?: string;
  channels: { id: string; name: string }[];
  groups: PriceGroupRow[];
  formats: { id: string; name: string }[];
  cells: {
    sale_channel_id: string;
    price_group_id: string;
    format_id: string;
    unit_price_cents: number;
  }[];
};

function cellKey(channelId: string, groupId: string, formatId: string) {
  return `${channelId}|${groupId}|${formatId}`;
}

/** Map the four list_* pricing queries onto PriceGroupsView tables. */
export function toPriceGroupsViewProps({
  channels,
  groups,
  formats,
  cells,
}: PriceGroupsSnapshot): PriceGroupsViewModel {
  const byKey = new Map(cells.map((c) => [cellKey(c.sale_channel_id, c.price_group_id, c.format_id), c]));
  return {
    channels: channels.map((channel) => {
      return {
        name: channel.name,
        headers: ["Group", ...formats.map((f) => f.name)],
        rows: groups.map((group) => [
          group.name,
          ...formats.map((format) => {
            const cell = byKey.get(cellKey(channel.id, group.id, format.id));
            return cell ? money(cell.unit_price_cents) : "not priced";
          }),
        ]),
      };
    }),
  };
}
