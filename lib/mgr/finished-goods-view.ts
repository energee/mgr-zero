// lib/mgr/finished-goods-view.ts — Finished goods stock and authorized get_inventory_value totals.
import type { EmptyState } from "./empty-state";
import { money } from "./money";
import type { InventoryValue } from "@/lib/commands/inventory";
import { plural } from "./plural";
import { bblExact } from "@/lib/volume";
import type { ScopeOption } from "@/components/mgr/scope-pick";
/** One SKU in the register. Counts are display text in package units; `atp`
 *  (shown as Available) uses a true minus sign when negative, and `short` says so. */
export type FinishedGoodsRowView = {
  key: string;
  /** The SKU's name without its brand when `group` names the brand above it. */
  name: string;
  /** Set on the first row of each brand: the heading over that brand's rows.
   *  `onHand` is the brand's barrels on hand, left out when any of its SKUs
   *  has no barrels per unit. */
  group?: { brand: string; onHand?: string };
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

export type FinishedGoodsMovements = {
  rows: {
    key: string; title: string; detail: string; outbound: boolean;
    /** The recorded day; consecutive rows of one day share a heading. */
    day: string;
    time: string;
    /** The document the movement came from; `href` when it has a staff page. */
    ref?: { label: string; href?: string };
  }[];
  /** The ledger's movement-type filter. `value` is the selected option
   *  ("all" for none); the fixture's options carry no href and stay inert. */
  type?: { value: string; options: ScopeOption[] };
};

export type FinishedGoodsSku = {
  id: string;
  name: string;
  brands?: { name: string } | null;
  /** list_skus' flag; false withholds the row's Record movement. */
  active?: boolean;
  /** list_skus' barrels per unit, for the brand's barrels on hand. */
  format_volume?: { bbl_per_unit: number | null } | null;
  on_hand: number;
  atp: number;
};

export type FinishedGoodsSnapshot = {
  skus: FinishedGoodsSku[];
  value?: { cents: number; uncostedUnits: number };
  backHref?: string;
};

/** A movement row's barrels, rounded to the nearest tenth ("0.1 bbl"). The ledger
 *  stores eight decimals, too long to read in a list. SKU detail and the lot
 *  trace show two decimals (bblFixed). */
export const movementBbl = (bbl: string | number) => bblExact(Number(bbl), 1);

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

/** The name a SKU sorts and groups under: its brand, or its own name without one. */
const brandOf = (sku: FinishedGoodsSku) => sku.brands?.name ?? sku.name;

/** A brand's barrels on hand to the nearest tenth; undefined when any SKU has no barrels per unit. */
function brandBbl(skus: FinishedGoodsSku[]) {
  let total = 0;
  for (const sku of skus) {
    const perUnit = sku.format_volume?.bbl_per_unit;
    if (perUnit == null) return undefined;
    total += sku.on_hand * Number(perUnit);
  }
  return movementBbl(total);
}

export function toFinishedGoodsViewProps({ skus, backHref, value }: FinishedGoodsSnapshot): FinishedGoodsViewModel {
  return {
    backHref: backHref ?? "/beer",
    // A zero total means no unit carries a cost (#1518): the line would only
    // read $0.00, so it shows once some stock is costed.
    valueLine: value?.cents ? `${money(value.cents)}${value.uncostedUnits ? ` · ${plural(value.uncostedUnits, "unit")} without cost` : ""}` : undefined,
    empty: skus.length === 0 ? { title: "No finished goods yet" } : undefined,
    rows: [...skus].sort((a, b) => brandOf(a).localeCompare(brandOf(b)) || a.name.localeCompare(b.name)).map((s, i, sorted) => {
      const short = s.atp < 0;
      const brand = s.brands?.name;
      const first = brand !== undefined && brand !== sorted[i - 1]?.brands?.name;
      return {
        key: s.id,
        name: brand && s.name.startsWith(`${brand} · `) ? s.name.slice(brand.length + 3) : s.name,
        group: first ? { brand, onHand: brandBbl(sorted.filter((sku) => sku.brands?.name === brand)) } : undefined,
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
