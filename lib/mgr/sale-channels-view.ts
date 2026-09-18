// lib/mgr/sale-channels-view.ts — view-model for Sale channels.
// list_sale_channels paints the domain; optional movements are inventory copy.
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";
import { sentenceCase } from "./labels";

export type SaleChannelsRowView = {
  key: string;
  title: string;
  detail: string;
  href?: string;
};

export type SaleChannelsViewModel = {
  backHref?: string;
  rows: SaleChannelsRowView[];
  empty?: EmptyState;
};

export type SaleChannelsSnapshot = {
  backHref?: string;
  channels: {
    id: string;
    name: string;
    tax_treatment: string;
    /** Inventory: movement count on the nav. Live omits this. */
    movements?: number;
  }[];
};

function detail(c: SaleChannelsSnapshot["channels"][number]): string {
  const label = sentenceCase(c.tax_treatment);
  return c.movements != null ? `${label} · ${plural(c.movements, "movement")}` : label;
}

/** Map a list_sale_channels payload onto SaleChannelsView. */
export function toSaleChannelsViewProps({ channels, backHref }: SaleChannelsSnapshot): SaleChannelsViewModel {
  return {
    backHref,
    empty: channels.length === 0 ? { title: "No sale channels yet", description: "A channel groups the customers that share a price list." } : undefined,
    rows: channels.map((c) => ({
      key: c.id,
      title: c.name,
      detail: detail(c),
    })),
  };
}
