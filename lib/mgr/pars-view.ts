// lib/mgr/pars-view.ts — view-model for Pars and allocation. Maps an optional
// get_shortfalls row plus list_standing_allocations (and the open order
// reservations / par the drawing also shows) onto ParsView. Live omits
// shortfall when the taproom has no SKU-scoped row; volume is omitted unless
// the caller knows bblPerUnit.
import { formatVolume } from "@/lib/volume";
import { docNo } from "./doc-no";
import { plural } from "./plural";

export type ParsActionTone = "primary" | "success" | "attention" | "info" | "destructive";

export type ParsRowView = {
  key: string;
  title: string;
  detail: string;
  verb?: string;
  tone: ParsActionTone;
  href?: string;
};

export type ParsViewModel = {
  title: string;
  backHref?: string;
  atp?: string;
  atpDetail?: string;
  rows: ParsRowView[];
};

/** One get_shortfalls row (camelCase, as the command returns). */
export type ParsShortfall = {
  skuId: string;
  skuName: string;
  atp: number;
  onHand: number;
  allocated: number;
};

/** Open order_line allocation joined to its order — not yet a dedicated command. */
export type ParsOrderAllocation = {
  id: string;
  qty: number;
  order_id: string;
  order_no: number | null;
  customers: { name: string } | null;
  write: "adjust_order_lines" | "release_allocation";
};

/** list_standing_allocations row, plus an optional location join. */
export type ParsStandingAllocation = {
  id: string;
  sku_id: string;
  qty: number;
  ref: string;
  skus: { name: string } | null;
  locations?: { name: string } | null;
};

export type ParsSnapshot = {
  shortfall?: ParsShortfall;
  /** Format volume for this SKU; omit rather than invent 0. */
  bblPerUnit?: number;
  unit?: string;
  orderAllocations?: ParsOrderAllocation[];
  standing: ParsStandingAllocation[];
  par?: { location_id: string; location_name: string; par_qty: number } | null;
  backHref?: string;
};

function qtyVolume(qty: number, bblPerUnit: number, unit: string): string {
  return `${plural(qty, unit)} · ${formatVolume(Number((qty * bblPerUnit).toFixed(2)))}`;
}

function signedQtyVolume(qty: number, bblPerUnit: number, unit: string): string {
  const count = qty < 0 ? `−${plural(Math.abs(qty), unit)}` : plural(qty, unit);
  return `${count} · ${formatVolume(Number((qty * bblPerUnit).toFixed(2)))}`;
}

function qtyDetail(qty: number, bblPerUnit?: number, unit?: string): string {
  if (bblPerUnit === undefined || unit === undefined) return String(qty);
  return qtyVolume(qty, bblPerUnit, unit);
}

export function toParsViewProps({
  shortfall,
  bblPerUnit,
  unit,
  orderAllocations = [],
  standing,
  par,
  backHref,
}: ParsSnapshot): ParsViewModel {
  const withVolume = bblPerUnit !== undefined && unit !== undefined;
  const rows: ParsRowView[] = [
    ...orderAllocations.map((a) => {
      const release = a.write === "release_allocation";
      return {
        key: a.id,
        title: `${docNo("ORD", a.order_no, "Order")} · ${a.customers?.name ?? "order"}`,
        detail: qtyDetail(Number(a.qty), bblPerUnit, unit),
        verb: release ? "Release" : "Adjust",
        tone: (release ? "destructive" : "attention") as ParsActionTone,
        href: `/orders/${a.order_id}`,
      };
    }),
    ...standing.map((a) => ({
      key: a.id,
      title: a.locations?.name ? `${a.locations.name} standing` : (a.skus?.name ?? "Standing"),
      detail: qtyDetail(Number(a.qty), bblPerUnit, unit),
      verb: withVolume ? "Edit" : undefined,
      tone: "primary" as const,
    })),
  ];
  if (par) {
    rows.push({
      key: `par-${par.location_id}`,
      title: `${par.location_name} par`,
      detail: qtyDetail(Number(par.par_qty), bblPerUnit, unit),
      verb: withVolume ? "Edit par" : undefined,
      tone: "primary",
    });
  }
  const atp = shortfall
    ? (withVolume
      ? signedQtyVolume(Number(shortfall.atp), bblPerUnit, unit)
      : (Number(shortfall.atp) < 0 ? `−${Math.abs(Number(shortfall.atp))}` : String(Number(shortfall.atp))))
    : undefined;
  const atpDetail = shortfall
    ? (unit
      ? `ATP · ${plural(Number(shortfall.onHand), unit)} on hand · ${Number(shortfall.allocated)} allocated`
      : `ATP · ${Number(shortfall.onHand)} on hand · ${Number(shortfall.allocated)} allocated`)
    : undefined;
  return {
    title: shortfall?.skuName ?? "Pars and allocation",
    backHref,
    atp,
    atpDetail,
    rows,
  };
}
