// tests/repack-view.test.ts — toRepackView: the live Repack sheet derives the
// outbound leg from the parent's composition; nobody types both halves.
import { describe, expect, it } from "vitest";
import { REPACK_UNAVAILABLE, soleRepackLot, toRepackView } from "@/lib/mgr/repack-view";

const base = { parent: "Hazy IPA · case · 24×16oz", unit: "case", location: "Warehouse · Walk-in", qty: "1" };

describe("toRepackView", () => {
  it("derives the child leg from composition and conserves the parent's bbl", () => {
    const model = toRepackView({ ...base, composition: { childLabel: "four-pack", quantity: 6, parentBbl: 0.096774 } });
    expect(model.tape[0]).toEqual(["−1 case · repack", "0.096774 bbl"]);
    expect(model.tape[1]).toEqual(["+6 four-pack · repack", "derived from the case total"]);
    expect(model.unavailable).toBeUndefined();
  });

  it("shows nothing to derive, and no refusal, before a parent is picked", () => {
    const model = toRepackView({ parent: "", unit: "", location: "", qty: "", composition: null });
    expect(model.tape).toEqual([]);
    expect(model.unavailable).toBeUndefined();
  });

  it("is unavailable when the parent has no single composition row", () => {
    const model = toRepackView({ ...base, composition: null });
    expect(model.unavailable).toBe(REPACK_UNAVAILABLE);
  });
});

describe("soleRepackLot", () => {
  const row = (lot: string | null, over: Partial<{ stock_id: string; bin_id: string }> = {}) =>
    ({ bin_id: "b1", kind: "sku" as const, stock_id: "case", lot_id: lot, keg_size: null, name: "case", unit: "case", lot_code: lot, qty: 5, ...over });

  it("picks the lot when the bin holds exactly one lot of the parent and no untracked stock", () => {
    expect(soleRepackLot([row("L1"), row("L2", { stock_id: "other" }), row("L3", { bin_id: "b2" })], "case", "b1")).toBe("L1");
  });
  it("leaves the choice empty with two lots, or a lot beside untracked stock, or nothing", () => {
    expect(soleRepackLot([row("L1"), row("L2")], "case", "b1")).toBe("");
    expect(soleRepackLot([row("L1"), row(null)], "case", "b1")).toBe("");
    expect(soleRepackLot([], "case", "b1")).toBe("");
  });
});
