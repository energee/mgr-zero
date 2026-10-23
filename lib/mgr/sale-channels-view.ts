// lib/mgr/sale-channels-view.ts — view-model for Sale channels.
// list_sale_channels paints the domain; optional movements are inventory copy.
// A row is deletable only where delete_sale_channel would succeed (#1207).
// CHANNEL_IN_USE_RULE is the one wording of the delete refusal, shared by the
// list (where a row lacks Delete) and the delete confirm.
import type { EmptyState } from "./empty-state";
import { plural } from "./plural";
import { sentenceCase } from "./labels";

export type SaleChannelsRowView = {
  key: string;
  title: string;
  detail: string;
  href?: string;
  /** Delete is offered: the role may delete, nothing uses the channel, and it
   *  is not the system Taproom channel. */
  deletable: boolean;
};

/** Why a delete is refused: inventory_movements, customers, orders,
 *  channel_prices and pos_menus all reference the channel, and each foreign
 *  key blocks the delete; delete_sale_channel also refuses the system Taproom
 *  channel (lib/commands/catalog.ts). */
export const CHANNEL_IN_USE_RULE = "A channel used by any movement, customer, order, price cell or Square menu cannot be deleted. The system Taproom channel can never be deleted.";

export type SaleChannelsViewModel = {
  backHref?: string;
  rows: SaleChannelsRowView[];
  empty?: EmptyState;
  /** The rule text (CHANNEL_IN_USE_RULE) drawn above the rows, explaining a
   *  missing Delete. Set only when a role that may delete sees such a row. */
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
    /** A record references the channel, so a foreign key refuses its delete. */
    in_use: boolean;
    /** 'taproom' marks the system Taproom channel, which is never deleted. */
    system_code: string | null;
    /** Inventory: movement count on the nav. Live omits this. */
    movements?: number;
  }[];
};

function detail(c: SaleChannelsSnapshot["channels"][number]): string {
  const label = sentenceCase(c.tax_treatment);
  return c.movements != null ? `${label} · ${plural(c.movements, "movement")}` : label;
}

/** Map a list_sale_channels payload onto SaleChannelsView. */
export function toSaleChannelsViewProps({ channels, backHref, canDelete = false }: SaleChannelsSnapshot): SaleChannelsViewModel {
  const rows = channels.map((c) => ({
    key: c.id,
    title: c.name,
    detail: detail(c),
    deletable: canDelete && !c.in_use && c.system_code === null,
  }));
  return {
    backHref,
    inUseRule: canDelete && rows.some((r) => !r.deletable) ? CHANNEL_IN_USE_RULE : undefined,
    empty: channels.length === 0 ? { title: "No sale channels yet", description: "A channel groups the customers that share a price list." } : undefined,
    rows,
  };
}
