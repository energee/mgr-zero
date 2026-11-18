// tests/release-view.test.ts — the release form's view-model (Phase A task A8 of
// docs/plans/portal-release-windows.md): batch prefill from the packaging
// projection, the stock form, the release_sku payload and its withheld
// reason, and how a release row reads.
import { describe, expect, it } from "vitest";
import { batchReleaseForms, releaseCommand, releaseDetail, skuReleaseForms, updateReleaseCommand, type ReleaseBatchRow, type ReleaseRow } from "../lib/mgr/release-view";

const batchRow = (skuId: string, name: string, units: number): ReleaseBatchRow => ({
  batch_id: "b1", batch_no: 12, sku_id: skuId, units, needed_by: "2026-12-04", skus: { name, brands: { name: "Stout" } },
});
const rows = [batchRow("s-keg", "Stout · ⅙ bbl keg", 40), batchRow("s-case", "Stout · case", 120), { ...batchRow("x", "Pils · case", 60), batch_id: "b2", batch_no: 13, needed_by: "2026-12-11", skus: { name: "Pils · case", brands: { name: "Pils" } } }];

const release: ReleaseRow = {
  id: "r1", batch_id: "b1", batch_no: 12, sku_id: "s-keg", sku_name: "Stout · ⅙ bbl keg", qty: 40, ships_from: "2026-12-04",
  orders_close_on: "2026-11-27", withdrawn_at: null, ready_on: "2026-12-04", open: true, cancelled: false, confirmed: 20, preordered: 8, remaining: 12,
};

describe("release form view-model", () => {
  it("prefills one form per planned batch with every projected SKU and the batch's ready date", () => {
    const forms = batchReleaseForms(rows);
    expect(forms.map((f) => [f.key, f.title, f.source])).toEqual([
      ["b1", "Batch 12 · Stout", "Batch 12 · ready Dec 4, 2026"],
      ["b2", "Batch 13 · Pils", "Batch 13 · ready Dec 11, 2026"],
    ]);
    expect(forms[0]).toMatchObject({ batchId: "b1", shipsFrom: "2026-12-04", ordersCloseOn: "" });
    expect(forms[0].lines).toEqual([
      { skuId: "s-keg", name: "Stout · ⅙ bbl keg", qty: "40", include: true },
      { skuId: "s-case", name: "Stout · case", qty: "120", include: true },
    ]);
    expect(forms[0].detail).toBe("ready Dec 4, 2026 · 2 packages");
  });

  it("offers a SKU packaged stock first, then each planned batch that projects it", () => {
    const forms = skuReleaseForms({ id: "s-keg", name: "Stout · ⅙ bbl keg" }, rows, "2026-11-18");
    expect(forms.map((f) => [f.key, f.source, f.shipsFrom])).toEqual([
      ["stock", "Packaged stock", "2026-11-18"],
      ["b1", "Batch 12 · ready Dec 4, 2026", "2026-12-04"],
    ]);
    expect(forms[0].lines).toEqual([{ skuId: "s-keg", name: "Stout · ⅙ bbl keg", qty: "", include: true }]);
    expect(forms[1].lines).toEqual([{ skuId: "s-keg", name: "Stout · ⅙ bbl keg", qty: "40", include: true }]);
  });

  it("builds release_sku from the ticked lines, and withholds it until one has a whole quantity", () => {
    const [form] = batchReleaseForms(rows);
    const unticked = { ...form, ordersCloseOn: "2026-11-27", lines: [{ ...form.lines[0], qty: "30" }, { ...form.lines[1], include: false }] };
    expect(releaseCommand(unticked)).toEqual({
      name: "release_sku", reason: null,
      input: { batchId: "b1", shipsFrom: "2026-12-04", ordersCloseOn: "2026-11-27", lines: [{ skuId: "s-keg", qty: 30 }] },
    });
    const stock = skuReleaseForms({ id: "s-keg", name: "Stout · ⅙ bbl keg" }, [], "2026-11-18")[0];
    expect(releaseCommand(stock).reason).toMatch(/whole quantity/);
    expect(releaseCommand({ ...stock, lines: [{ ...stock.lines[0], qty: "2.5" }] }).reason).toMatch(/whole quantity/);
    expect(releaseCommand({ ...stock, lines: [{ ...stock.lines[0], qty: "6" }] }).input).toEqual({ shipsFrom: "2026-11-18", lines: [{ skuId: "s-keg", qty: 6 }] });
  });

  it("reads a release as left of total, confirmed and pre-ordered, then its dates", () => {
    expect(releaseDetail(release)).toBe("12 of 40 left · 20 confirmed · 8 pre-ordered · ships Dec 4, 2026 · order by Nov 27, 2026");
  });

  it("edits quantity and order-by date, clearing a blank order-by", () => {
    expect(updateReleaseCommand(release, "30", "")).toEqual({ name: "update_release", input: { releaseId: "r1", qty: 30, ordersCloseOn: null }, reason: null });
    expect(updateReleaseCommand(release, "0", "").reason).toMatch(/whole quantity/);
  });
});

describe("release forms skip what is already released", () => {
  it("leaves a batch's released packages out of its form, and marks it released once all are", () => {
    const [partly] = batchReleaseForms(rows, [release]);
    expect(partly.released).toBe(false);
    expect(partly.lines.map((l) => l.skuId)).toEqual(["s-case"]);
    const [all] = batchReleaseForms(rows, [release, { ...release, id: "r2", sku_id: "s-case" }]);
    expect(all.released).toBe(true);
  });

  it("does not offer a SKU a batch it already has an open release from", () => {
    const forms = skuReleaseForms({ id: "s-keg", name: "Stout · ⅙ bbl keg" }, rows, "2026-11-18", [release]);
    expect(forms.map((f) => f.key)).toEqual(["stock"]);
  });
});
