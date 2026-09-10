export type MaterialRequirementSnapshot = {
  material_id: string;
  material_name: string | null;
  base_uom: string | null;
  purchase_uom: string | null;
  required: number;
  on_hand: number;
  on_order: number;
  short: number;
  purchase_units_short: number;
  needed_by: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  lead_time_days: number | null;
  buy_by: string | null;
  out_of_reach: boolean;
};

export type PlanningSnapshot = {
  requirements?: MaterialRequirementSnapshot[];
  horizon?: (string | number)[][];
  reviews?: { key: string; title: string; detail: string; warning?: boolean }[];
  drafts?: { key: string; title: string; detail: string; quantity: string; warning?: boolean }[];
  info?: string;
};

export type PlanningViewModel = {
  requirements: { key: string; title: string; detail: string; quantity: string; warning: boolean }[];
  horizon?: (string | number)[][];
  reviews?: PlanningSnapshot["reviews"];
  drafts?: PlanningSnapshot["drafts"];
  info?: string;
};

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });

export function toPlanningViewProps(snapshot: PlanningSnapshot): PlanningViewModel {
  return {
    requirements: (snapshot.requirements ?? []).filter((row) => row.short > 0).map((row) => ({
      key: row.material_id,
      title: row.material_name ?? row.material_id,
      detail: [
        `need ${fmt(row.required)} · on hand ${fmt(row.on_hand)} · on order ${fmt(row.on_order)} ${row.base_uom ?? ""}`,
        row.needed_by ? `needed by ${row.needed_by}` : undefined,
        row.vendor_name ? `${row.vendor_name}${row.lead_time_days === null ? " · no lead time typed" : ` · ${row.lead_time_days} day lead · buy by ${row.buy_by}`}` : "no contract and no default vendor",
        row.out_of_reach ? "past the buy-by date · left out of the draft" : undefined,
      ].filter(Boolean).join(" · "),
      quantity: `${fmt(row.purchase_units_short)} ${row.purchase_uom ?? ""}`.trim(),
      warning: !row.vendor_id || row.out_of_reach,
    })),
    horizon: snapshot.horizon,
    reviews: snapshot.reviews,
    drafts: snapshot.drafts,
    info: snapshot.info,
  };
}
