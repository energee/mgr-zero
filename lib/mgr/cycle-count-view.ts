// lib/mgr/cycle-count-view.ts — view-model for a material count: a row's
// Cycle count (one material) and the Count sheet (every material held in one
// bin, #1583). Both send one get_material_count_preview and one
// record_material_count over all their counted lines.
import { canRetireCommandFailure } from "@/lib/commands/failure";

// The count RPC replays a completed request before checking its revision.
// This exact refusal therefore proves even an uncertain earlier send did not
// commit. Other conflicts (including request identity mismatches) do not.
export function canRetireMaterialCountFailure(status: number, retrying: boolean, code: string | undefined, message: string) {
  return (status === 409 && code === "conflict" && message === "Material stock changed. Preview the count again.")
    || canRetireCommandFailure(status, retrying, code);
}

/** One material on a count: its counted field, the line summary, and the preview's lot adjustments. */
export type CycleCountLineView = {
  key: string;
  material: string;
  qty: string;
  unitIndex: number;
  units: string[];
  preview: string;
  adjustments?: { key: string; lot: string; expected: number; counted: number; delta: number; unit: string }[];
};

/** `empty` replaces the lines when a Count sheet's bin holds none of its materials. */
export type CycleCountViewModel = {
  lines: CycleCountLineView[];
  empty?: string;
  locationId?: string;
  binId?: string;
  locations?: { id: string; name: string }[];
  bins?: { id: string; name: string }[];
};


export type MaterialCountPreview = {
  revision: string;
  lines: {
    material_id: string; material_name: string; base_uom: string;
    qty_expected: number; qty_counted: number;
    adjustments: { lot_id: string | null; lot_code: string | null; qty_expected: number; qty_counted: number; delta: number }[];
  }[];
};

/** Where a cycle count starts: the bin holding the most of the material
 *  (`onHand` is get_material_on_hand's rows for it), else the first
 *  location's first bin. A row at a location not offered is skipped. */
export function countDefaultBin(
  onHand: { location_id: string; bin_id: string; qty: number | string }[],
  locations: { id: string }[],
  bins: { id: string; location_id: string }[],
): { locationId: string; binId: string } {
  let top: (typeof onHand)[number] | undefined;
  for (const row of onHand) {
    if (Number(row.qty) > Number(top?.qty ?? 0) && locations.some((l) => l.id === row.location_id)) top = row;
  }
  if (top) return { locationId: top.location_id, binId: top.bin_id };
  const locationId = locations[0]?.id ?? "";
  return { locationId, binId: bins.find((b) => b.location_id === locationId)?.id ?? "" };
}

type CountMaterial = { id: string; name: string; uom: string };
const figure = (value: number, sign: "auto" | "exceptZero" = "auto") =>
  value.toLocaleString("en-US", { maximumFractionDigits: 4, signDisplay: sign });

/** Count sheet: the listed materials with a nonzero balance in this bin, in
 *  list order. `onHand` is get_material_on_hand's rows. */
export function materialsHeldAt<M extends { id: string }>(
  materials: M[],
  onHand: { material_id: string; location_id: string; bin_id: string; qty: number | string }[],
  locationId: string,
  binId: string,
): M[] {
  const held = new Set(onHand.filter((row) => row.location_id === locationId && row.bin_id === binId && Number(row.qty) !== 0).map((row) => row.material_id));
  return materials.filter((material) => held.has(material.id));
}

/** The lines a count sends: each listed material with a quantity typed in
 *  `counts` (keyed by material id). Null when none is typed or a typed one is
 *  not a number of zero or more, so the form withholds Preview count. */
export function countLines(materials: { id: string }[], counts: Record<string, string>): { materialId: string; qty: number }[] | null {
  const typed = materials.filter((material) => (counts[material.id] ?? "") !== "");
  const lines = typed.map((material) => ({ materialId: material.id, qty: Number(counts[material.id]) }));
  const valid = lines.every((line) => Number.isFinite(line.qty) && line.qty >= 0);
  return lines.length > 0 && valid ? lines : null;
}

/** One material's line on a count. The system quantity is the preview's once
 *  previewed, else `onHandQty` (the bin's balance); the variance appears once
 *  a count is typed. */
export function countLineView(material: CountMaterial, qty: string, onHandQty: number, plan: MaterialCountPreview | null): CycleCountLineView {
  const planned = qty === "" ? undefined : plan?.lines.find((line) => line.material_id === material.id);
  const system = planned?.qty_expected ?? onHandQty;
  const status = qty === "" ? "not counted"
    : `variance ${figure(Number(qty) - system, "exceptZero")} · ${planned ? "reviewed against current stock" : "preview before recording"}`;
  return {
    key: material.id, material: material.name, qty, units: [material.uom], unitIndex: 0,
    preview: `system ${figure(system)} · ${status}`,
    adjustments: planned?.adjustments.map((row) => ({ key: row.lot_id ?? "untracked", lot: row.lot_code ?? "Untracked stock", expected: row.qty_expected, counted: row.qty_counted, delta: row.delta, unit: planned.base_uom })),
  };
}
