// lib/mgr/sale-channels-view.ts — view-model for Sale channels.
// list_sale_channels paints the domain; optional movements are inventory copy.
import { plural } from "./plural";

export type SaleChannelsRowView = {
  key: string;
  title: string;
  detail: string;
  href?: string;
};

export type SaleChannelsViewModel = {
  backHref?: string;
  rows: SaleChannelsRowView[];
  empty?: string;
};

export type SaleChannelsSnapshot = {
  channels: {
    id: string;
    name: string;
    tax_treatment: string;
    /** Inventory: movement count on the nav. Live omits this. */
    movements?: number;
  }[];
};

/** "vessel_supplies" → "vessel supplies"; matches tax-treatments.treatmentLabel. */
export const channelTreatmentLabel = (t: string) => t.replaceAll("_", " ");

function detail(c: SaleChannelsSnapshot["channels"][number]): string {
  const label = channelTreatmentLabel(c.tax_treatment);
  return c.movements != null ? `${label} · ${plural(c.movements, "movement")}` : label;
}

/** Map a list_sale_channels payload onto SaleChannelsView. */
export function toSaleChannelsViewProps({ channels }: SaleChannelsSnapshot): SaleChannelsViewModel {
  return {
    backHref: "/settings",
    empty: channels.length === 0 ? "No sale channels yet" : undefined,
    rows: channels.map((c) => ({
      key: c.id,
      title: c.name,
      detail: detail(c),
    })),
  };
}
