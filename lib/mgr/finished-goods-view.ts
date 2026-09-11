// lib/mgr/finished-goods-view.ts — view-model for Finished goods (get_on_hand / get_atp).
export type FinishedGoodsRowView = {
  key: string;
  title: string;
  detail: string;
  href: string;
  shortfallHref?: string;
  verb: "Review" | "Shortfall";
  tone: "primary" | "attention";
  warning: boolean;
};

export type FinishedGoodsViewModel = {
  backHref?: string;
  rows: FinishedGoodsRowView[];
  empty?: string;
};

export type FinishedGoodsSku = {
  id: string;
  name: string;
  brands?: { name: string } | null;
  on_hand: number;
  atp: number;
};

export type FinishedGoodsSnapshot = {
  skus: FinishedGoodsSku[];
  backHref?: string;
};

type StockRow = { sku_id: string; qty: string | number };

export function assembleFinishedGoods(
  skus: Omit<FinishedGoodsSku, "on_hand" | "atp">[],
  onHandRows: StockRow[],
  atpRows: StockRow[],
): FinishedGoodsSnapshot {
  const sum = (rows: StockRow[]) => rows.reduce(
    (totals, row) => totals.set(row.sku_id, (totals.get(row.sku_id) ?? 0) + Number(row.qty)),
    new Map<string, number>(),
  );
  const onHand = sum(onHandRows);
  const atp = new Map(atpRows.map((row) => [row.sku_id, Number(row.qty)]));
  return {
    skus: skus.filter((sku) => onHand.has(sku.id) || atp.has(sku.id)).map((sku) => ({
      ...sku,
      on_hand: onHand.get(sku.id) ?? 0,
      atp: atp.get(sku.id) ?? onHand.get(sku.id) ?? 0,
    })),
  };
}

export const skuLabel = (sku: { name: string; brands?: { name: string } | null }) =>
  sku.brands?.name ? `${sku.brands.name} · ${sku.name}` : sku.name;

export function toFinishedGoodsViewProps({ skus, backHref }: FinishedGoodsSnapshot): FinishedGoodsViewModel {
  return {
    backHref: backHref ?? "/beer",
    empty: skus.length === 0 ? "No finished goods yet" : undefined,
    rows: skus.map((s) => {
      const allocated = s.on_hand - s.atp;
      const short = s.atp < 0;
      const atp = short ? `−${Math.abs(s.atp)}` : String(s.atp);
      return {
        key: s.id,
        title: skuLabel(s),
        detail: `${s.on_hand} on hand · ${allocated} allocated · ATP ${atp}`,
        href: `/inventory/${s.id}`,
        shortfallHref: short ? `/replenishment?sku=${s.id}` : undefined,
        verb: short ? "Shortfall" : "Review",
        tone: short ? "attention" : "primary",
        warning: short,
      };
    }),
  };
}
