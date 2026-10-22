// lib/mgr/price-groups-view.ts — view-model for the Price groups grid.
// list_sale_channels × list_price_groups × list_formats, filled from
// list_channel_prices. One channel shows at a time, chosen by tab. Packaged
// formats are one column each. Pours owned by a price group share a column by
// name; a group with no pour of that name has a null formatId there (the grid
// offers to add it). A cell is the dollars-input text ("12.50"), or null when
// unpriced.
import { dollarsInput, toCents } from "./money";

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
  /** Sale channel names, one tab each. */
  tabs: string[];
  /** Index of the channel showing. */
  tab: number;
  /** Live: each tab's link. Inventory leaves it out and draws inert tabs. */
  tabHrefs?: [label: string, href: string][];
  /** The showing channel's table; null when there are no channels. */
  channel: PriceGroupsChannelView | null;
};

/** One row of list_price_groups: the grid row and its $/bbl ceiling. */
export type PriceGroupRow = { id: string; name: string; position: number; cost_ceiling_cents: number | null };
/** One list_price_group_barcodes row: a group's UPC for one packaged format. */
export type PriceGroupBarcode = { price_group_id: string; format_id: string; upc: string };
export const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

export type PriceGroupsSnapshot = {
  backHref?: string;
  /** The channel to show; an unknown or missing id shows the first. */
  channelId?: string;
  /** Live: the link for a channel's tab. */
  channelHref?: (channelId: string) => string;
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
  /** list_price_group_barcodes; absent for a role that cannot read them. */
  barcodes?: PriceGroupBarcode[];
  cells: {
    sale_channel_id: string;
    price_group_id: string;
    format_id: string;
    unit_price_cents: number;
  }[];
};

export const cellKey = (channelId: string, groupId: string, formatId: string) => `${channelId}|${groupId}|${formatId}`;

/** A price group's UPC for one format, if it has one. A group-less brand has none. */
export const barcodeOf = (barcodes: PriceGroupBarcode[] | undefined, groupId: string | null | undefined, formatId: string) =>
  groupId ? barcodes?.find((b) => b.price_group_id === groupId && b.format_id === formatId)?.upc : undefined;

/** A format column's label: "Hazy · ½ bbl keg" when the format belongs to a brand. */
export const formatLabel = (f: PriceGroupsSnapshot["formats"][number]) => f.brands ? `${f.brands.name} · ${f.name}` : f.name;

/** One column per packaged format, then one per pour name; `formatId` says which format a group's cell prices. */
function pricingColumns(formats: PriceGroupsSnapshot["formats"]) {
  const packaged = formats.filter((f) => f.basis !== "poured");
  const pours = Map.groupBy(formats.filter((f) => f.basis === "poured"), (f) => f.name);
  return [
    ...packaged.map((f) => ({ label: formatLabel(f), formatId: (): string | null => f.id })),
    ...[...pours].map(([name, group]) => ({
      label: name,
      formatId: (groupId: string) => group.find((f) => f.price_group_id === groupId)?.id ?? null,
    })),
  ];
}

/** Map the four list_* pricing queries onto PriceGroupsView: tabs, and the showing channel's table. */
export function toPriceGroupsViewProps({ channels, groups, formats, cells, channelId, channelHref }: PriceGroupsSnapshot): PriceGroupsViewModel {
  const byKey = new Map(cells.map((c) => [cellKey(c.sale_channel_id, c.price_group_id, c.format_id), c.unit_price_cents]));
  const columns = pricingColumns(formats);
  const tab = Math.max(0, channels.findIndex((c) => c.id === channelId));
  const channel = channels[tab];
  return {
    formats: columns.map((c) => c.label),
    groupCount: groups.length,
    tabs: channels.map((c) => c.name),
    tab,
    ...(channelHref ? { tabHrefs: channels.map((c): [string, string] => [c.name, channelHref(c.id)]) } : {}),
    channel: channel ? {
      id: channel.id,
      name: channel.name,
      rows: groups.map((group) => {
        const formatIds = columns.map((column) => column.formatId(group.id));
        return {
          id: group.id,
          name: group.name,
          formatIds,
          cells: formatIds.map((formatId) => {
            if (!formatId) return null;
            const cents = byKey.get(cellKey(channel.id, group.id, formatId));
            return cents === undefined ? null : dollarsInput(cents);
          }),
        };
      }),
    } : null,
  };
}

/** What leaving an inline price cell does: nothing, ask to clear, save cents, or refuse the text. */
export type CellCommit = { kind: "none" } | { kind: "clear" } | { kind: "save"; cents: number } | { kind: "invalid" };

/** `initial` is the saved dollars text ("" when unpriced); emptying a priced cell asks before clearing. */
export function cellCommit(initial: string, dollars: string): CellCommit {
  const text = dollars.trim().replace(/^\$/, "");
  if (text === "") return initial === "" ? { kind: "none" } : { kind: "clear" };
  const cents = toCents(text);
  if (cents === undefined || !Number.isFinite(cents) || cents < 0) return { kind: "invalid" };
  // "7" over a saved "7.00" is the same price: nothing to save.
  return cents === toCents(initial) ? { kind: "none" } : { kind: "save", cents };
}
