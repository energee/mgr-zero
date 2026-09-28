import { expect, it } from "vitest";
import { packagingActualsReady } from "@/lib/mgr/packaging-actuals";

const material = { id: "material", name: "Cans", unit: "each", lotTracked: false };
const row = { key: "line", materialId: "material", locationId: "warehouse", binId: "dry", lotId: null, used: "90", loss: "3", unused: "7" };
it("requires explicit quantities and whole counted units without treating unused as another debit", () => {
  expect(packagingActualsReady([row], [material], [material.id])).toBe(true);
  expect(packagingActualsReady([{ ...row, used: "0", loss: "0", unused: "0" }], [material], [material.id])).toBe(true);
  for (const patch of [{ used: "" }, { unused: "" }, { loss: "-1" }, { used: "0.5" }, { binId: "" }]) {
    expect(packagingActualsReady([{ ...row, ...patch }], [material], [material.id])).toBe(false);
  }
  expect(packagingActualsReady([], [material], [material.id])).toBe(false);
  expect(packagingActualsReady([row, { ...row, key: "duplicate" }], [material], [material.id])).toBe(false);
});
it("allows four-decimal measured materials and requires a tracked source lot", () => {
  const measured = { ...material, unit: "lb", lotTracked: true };
  expect(packagingActualsReady([{ ...row, used: "0.0001", lotId: "lot" }], [measured], [material.id])).toBe(true);
  expect(packagingActualsReady([{ ...row, used: "0.00001", lotId: "lot" }], [measured], [material.id])).toBe(false);
  expect(packagingActualsReady([row], [measured], [material.id])).toBe(false);
});

import { suggestedPackagingActuals } from "@/lib/mgr/packaging-actuals";
it("prefills the reviewed plan across FEFO sources and keeps a visible shortage", () => {
  const plan = { planned: [{ materialId: material.id, name: material.name, unit: "each", lotTracked: true, qty: 100, onHand: 70, onOrder: 0, short: 30 }], sources: [
    { materialId: material.id, locationId: "warehouse", binId: "dry", lotId: "first", qty: 30 },
    { materialId: material.id, locationId: "warehouse", binId: "dry", lotId: "second", qty: 40 },
  ] };
  const rows = suggestedPackagingActuals(plan);
  expect(rows.map(row => [row.lotId, row.used])).toEqual([["first", "30"], ["second", "70"]]);
  expect(rows.every(row => row.loss === "0" && row.unused === "0")).toBe(true);
});

import { packagingCorrectionPlan } from "@/lib/mgr/packaging-actuals";
it("shows replacement capacity after exact prior usage and loss reversals", () => {
  const plan = { revision: "current", planned: [], materials: [material], lots: [], sources: [{ materialId: material.id, locationId: "warehouse", binId: "dry", lotId: null, qty: 17 }] };
  const record = { id: "record", created_at: "today", corrects_id: null, correction_reason: null, planned: [], actuals: [{ material_id: material.id, location_id: "warehouse", bin_id: "dry", lot_id: null, material_name: "Cans", unit: "each", location_name: "Warehouse", bin_name: "Dry", lot_code: null, qty_used: 80, qty_loss: 3, qty_unused: 17 }] };
  expect(packagingCorrectionPlan(plan, record).sources[0].qty).toBe(100);
  expect(plan.sources[0].qty).toBe(17);
});

it("keeps four-decimal measured suggestions and reversal capacity exact", () => {
  const measured = { ...material, unit: "lb" };
  const plan = { revision: "measured", materials: [measured], lots: [], planned: [{ materialId: material.id, name: material.name, unit: "lb", lotTracked: false, qty: 0.3 }], sources: [
    { materialId: material.id, locationId: "warehouse", binId: "one", lotId: null, qty: 0.1 },
    { materialId: material.id, locationId: "warehouse", binId: "two", lotId: null, qty: 0.2 },
  ] };
  const rows = suggestedPackagingActuals(plan);
  expect(rows.map(row => row.used)).toEqual(["0.1", "0.2"]);
  expect(packagingActualsReady(rows, [measured], [material.id])).toBe(true);
});
