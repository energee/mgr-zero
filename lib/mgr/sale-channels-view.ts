// lib/mgr/sale-channels-view.ts — view-model for Sale channels.
// list_sale_channels paints the domain; optional movements are inventory copy.
// CHANNEL_IN_USE_RULE is the one wording of the delete refusal, shared by the
// list (for a role that may delete) and the delete confirm.
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";
import { sentenceCase } from "./labels";

export type SaleChannelsRowView = {
  key: string;
  title: string;
  detail: string;
  href?: string;
};

/** Why a delete is refused: inventory_movements, customers, orders,
 *  channel_prices and pos_menus all reference the channel, and each foreign
 *  key blocks the delete (delete_sale_channel in lib/commands/catalog.ts). */
export const CHANNEL_IN_USE_RULE = "A channel used by any movement, customer, order, price cell or Square menu cannot be deleted.";

export type SaleChannelsViewModel = {
  backHref?: string;
  rows: SaleChannelsRowView[];
  empty?: EmptyState;
  /** The rule text (CHANNEL_IN_USE_RULE) drawn above the rows, not a
   *  note on the Delete action. Set only when canDelete is. */
  inUseRule?: string;
};

export type SaleChannelsSnapshot = {
  backHref?: string;
  /** A role that may run delete_sale_channel. Live sets it from canRun; the
   *  inventory frame sets it to show the Admin persona. */
  canDelete?: boolean;
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
export function toSaleChannelsViewProps({ channels, backHref, canDelete }: SaleChannelsSnapshot): SaleChannelsViewModel {
  return {
    backHref,
    inUseRule: canDelete && channels.length > 0 ? CHANNEL_IN_USE_RULE : undefined,
    empty: channels.length === 0 ? { title: "No sale channels yet", description: "A channel groups the customers that share a price list." } : undefined,
    rows: channels.map((c) => ({
      key: c.id,
      title: c.name,
      detail: detail(c),
    })),
  };
}
