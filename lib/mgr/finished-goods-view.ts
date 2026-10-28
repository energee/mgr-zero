// lib/mgr/finished-goods-view.ts — Finished goods stock and authorized get_inventory_value totals.
import type { EmptyState } from "./empty-state";
import { money } from "./money";
import type { InventoryValue } from "@/lib/commands/inventory";
import { plural } from "./plural";
/** One SKU in the register. Counts are display text in package units; `atp`
 *  (shown as Available) uses a true minus sign when negative, and `short` says so. */
export type FinishedGoodsRowView = {
  key: string;
  name: string;
  onHand: string;
  allocated: string;
  atp: string;
  short: boolean;
  /** SKU detail: the row's one identity link. */
  href: string;
  /** Replenishment for this SKU; the view links it only when `short`. */
  shortfallHref: string;
  /** Record movement opened on this SKU (the deep link SKU detail's header
   *  button uses); null for a retired SKU, which SKU detail withholds too. */
  movementHref: string | null;
};

export type FinishedGoodsViewModel = {
  backHref?: string;
  rows: FinishedGoodsRowView[];
  valueLine?: string;
  empty?: EmptyState;
};

export type FinishedGoodsSku = {
  id: string;
  name: string;
  brands?: { name: string } | null;
  /** list_skus' flag; false withholds the row's Record movement. */
  active?: boolean;
  on_hand: number;
  atp: number;
};

export type FinishedGoodsSnapshot = {
  skus: FinishedGoodsSku[];
  value?: { cents: number; uncostedUnits: number };
  backHref?: string;
};

type StockRow = { sku_id: string; qty: string | number };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function assembleFinishedGoods(
  skus: Omit<FinishedGoodsSku, "on_hand" | "atp">[],
  onHandRows: StockRow[],
  atpRows: StockRow[],
  value?: InventoryValue,
): FinishedGoodsSnapshot {
  // qty is numeric(12,2); round each running total so 0.10 + 0.20 stays 0.3.
  const sum = (rows: StockRow[]) => rows.reduce(
    (totals, row) => totals.set(row.sku_id, round2((totals.get(row.sku_id) ?? 0) + Number(row.qty))),
    new Map<string, number>(),
  );
  const onHand = sum(onHandRows);
  const atp = new Map(atpRows.map((row) => [row.sku_id, Number(row.qty)]));
  return {
    // Uncosted units contribute no dollars, but their count stays explicit.
    ...(value ? { value: { cents: Math.round(value.value_cents), uncostedUnits: round2(value.uncosted_qty) } } : {}),
    skus: skus.filter((sku) => onHand.has(sku.id) || atp.has(sku.id)).map((sku) => ({
      ...sku,
      on_hand: onHand.get(sku.id) ?? 0,
      atp: atp.get(sku.id) ?? onHand.get(sku.id) ?? 0,
    })),
  };
}

/** "Brand · SKU", unless the SKU name already leads with the brand: create_sku names a SKU "brand · format" by default. */
export const skuLabel = (sku: { name: string; brands?: { name: string } | null }) =>
  sku.brands?.name && !sku.name.startsWith(sku.brands.name) ? `${sku.brands.name} · ${sku.name}` : sku.name;

export function toFinishedGoodsViewProps({ skus, backHref, value }: FinishedGoodsSnapshot): FinishedGoodsViewModel {
  return {
    backHref: backHref ?? "/beer",
    valueLine: value ? `${money(value.cents)}${value.uncostedUnits ? ` · ${plural(value.uncostedUnits, "unit")} without cost` : ""}` : undefined,
    empty: skus.length === 0 ? { title: "No finished goods yet", description: "Packaged stock appears here once a packaging run is recorded." } : undefined,
    rows: skus.map((s) => {
      const short = s.atp < 0;
      return {
        key: s.id,
        name: skuLabel(s),
        onHand: String(s.on_hand),
        allocated: String(round2(s.on_hand - s.atp)),
        atp: short ? `−${Math.abs(s.atp)}` : String(s.atp),
        short,
        href: `/inventory/${s.id}`,
        shortfallHref: `/replenishment?sku=${s.id}#shortfalls`,
        movementHref: s.active === false ? null : `/inventory?recordMovement=1&skuId=${s.id}`,
      };
    }),
  };
}
