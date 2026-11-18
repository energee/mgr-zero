// tests/confirm-order-view.test.ts — Confirm order flags for pre-orders on a
// portal release (Phase A task A11 of docs/plans/portal-release-windows.md):
// Slipped when the batch is now ready after the requested date, Over release
// when the release was lowered below what is confirmed plus pre-ordered.
import { describe, expect, it } from "vitest";
import { toConfirmOrderViewProps, type ConfirmOrderSnapshot } from "../lib/mgr/confirm-order-view";
import type { ReleaseRow } from "../lib/mgr/release-view";

const release: ReleaseRow = {
  id: "r1", batch_id: "b1", batch_no: 12, sku_id: "s1", sku_name: "Stout · case", qty: 40, ships_from: "2026-12-04",
  orders_close_on: null, withdrawn_at: null, ready_on: "2026-12-04", open: true, cancelled: false, confirmed: 20, preordered: 10, remaining: 10,
};
const snapshot: ConfirmOrderSnapshot = {
  order: { id: "o1", order_no: 7, status: "submitted", requested_ship_date: "2026-12-05", from_location_id: "l1", customers: { name: "Bar" } },
  lines: [
    { id: "line-release", sku_id: "s1", qty_ordered: 10, release_id: "r1", skus: { name: "Stout · case" } },
    { id: "line-stock", sku_id: "s2", qty_ordered: 2, release_id: null, skus: { name: "Pils · case" } },
  ],
  atp: [], locations: [{ id: "l1", name: "Warehouse" }], releases: [release],
};
const flagsOf = (s: ConfirmOrderSnapshot) => Object.fromEntries(toConfirmOrderViewProps(s).lines.map((l) => [l.key, l.flags]));

describe("Confirm order release flags", () => {
  it("flags nothing while the release holds and the batch is ready in time", () => {
    expect(flagsOf(snapshot)).toEqual({ "line-release": [], "line-stock": [] });
  });

  it("flags a release line whose batch is now ready after the requested date", () => {
    const slipped = flagsOf({ ...snapshot, releases: [{ ...release, ready_on: "2026-12-11" }] });
    expect(slipped["line-release"]).toEqual(["Slipped: batch ready Dec 11, 2026"]);
    expect(toConfirmOrderViewProps({ ...snapshot, releases: [{ ...release, ready_on: "2026-12-11" }] }).lines.find((l) => l.key === "line-release")?.tone).toBe("w");
  });

  it("flags a line on a withdrawn release or on a release whose batch was cancelled", () => {
    expect(flagsOf({ ...snapshot, releases: [{ ...release, withdrawn_at: "2026-11-20T00:00:00Z", open: false }] })["line-release"]).toEqual(["Release withdrawn"]);
    expect(flagsOf({ ...snapshot, releases: [{ ...release, cancelled: true, open: false }] })["line-release"]).toEqual(["Release closed: batch cancelled"]);
  });

  it("flags pre-orders over a release lowered below confirmed plus pre-ordered", () => {
    expect(flagsOf({ ...snapshot, releases: [{ ...release, qty: 25 }] })["line-release"]).toEqual(["Over release: 30 ordered of 25"]);
  });
});
