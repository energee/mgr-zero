// tests/release-view.test.ts — the release form's view-model (Phase A task A8 of
// docs/plans/portal-release-windows.md, and release-pool-and-ceilings.md): a
// batch form's pool and packages, the stock form, the release_sku payload and
// its withheld reason, and how a release row reads.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReleaseView } from "../components/mgr/views/release";
import { batchReleaseForms, releaseCommand, releaseDetail, skuReleaseForms, updateReleaseCommand, type ReleaseBatchRow, type ReleaseRow } from "../lib/mgr/release-view";

const batchRow = (skuId: string, name: string): ReleaseBatchRow => ({
  batch_id: "b1", batch_no: 12, sku_id: skuId, planned_bbl: 17, wholesale_bbl: null, needed_by: "2026-12-04", skus: { name, brands: { name: "Stout" } },
});
const rows = [batchRow("s-keg", "Stout · ⅙ bbl keg"), batchRow("s-case", "Stout · case"), { ...batchRow("x", "Pils · case"), batch_id: "b2", batch_no: 13, needed_by: "2026-12-11", skus: { name: "Pils · case", brands: { name: "Pils" } } }];

const release: ReleaseRow = {
  id: "r1", batch_id: "b1", batch_no: 12, sku_id: "s-keg", sku_name: "Stout · ⅙ bbl keg", qty: 40, ships_from: "2026-12-04",
  orders_close_on: "2026-11-27", withdrawn_at: null, ready_on: "2026-12-04", open: true, cancelled: false, confirmed: 20, preordered: 8, remaining: 12,
};

describe("release form view-model", () => {
  it("prefills one form per planned batch with its pool, every package and the batch's ready date", () => {
    const forms = batchReleaseForms(rows);
    expect(forms.map((f) => [f.key, f.title, f.source])).toEqual([
      ["b1", "Batch 12 · Stout", "Batch 12 · ready Dec 4, 2026"],
      ["b2", "Batch 13 · Pils", "Batch 13 · ready Dec 11, 2026"],
    ]);
    // 75% of 17 bbl, and ordering closes 7 days before ship: the brewery defaults.
    expect(forms[0]).toMatchObject({ batchId: "b1", shipsFrom: "2026-12-04", ordersCloseOn: "2026-11-27", wholesaleBbl: "12.75", plannedBbl: 17 });
    expect(forms[0].lines).toEqual([
      { skuId: "s-keg", name: "Stout · ⅙ bbl keg", qty: "", include: true },
      { skuId: "s-case", name: "Stout · case", qty: "", include: true },
    ]);
    expect(forms[0].detail).toBe("ready Dec 4, 2026 · 17 bbl · 2 packages");
  });

  it("uses the brewery's defaults, and a batch's own pool once it has one", () => {
    expect(batchReleaseForms(rows, [], { openPct: 50, orderByDays: 10 })[0]).toMatchObject({ wholesaleBbl: "8.5", ordersCloseOn: "2026-11-24" });
    expect(batchReleaseForms(rows.map((r) => ({ ...r, wholesale_bbl: 9 })))[0]).toMatchObject({ wholesaleBbl: "9" });
    // At 100% the default rounds down, so it never reads above what is planned.
    expect(batchReleaseForms(rows.map((r) => ({ ...r, planned_bbl: 17.0468 })), [], { openPct: 100, orderByDays: 7 })[0]).toMatchObject({ wholesaleBbl: "17.04" });
  });

  it("offers a SKU packaged stock first, then each planned batch that projects it", () => {
    const forms = skuReleaseForms({ id: "s-keg", name: "Stout · ⅙ bbl keg" }, rows, "2026-11-18");
    expect(forms.map((f) => [f.key, f.source, f.shipsFrom])).toEqual([
      ["stock", "Packaged stock", "2026-11-18"],
      ["b1", "Batch 12 · ready Dec 4, 2026", "2026-12-04"],
    ]);
    expect(forms[0].lines).toEqual([{ skuId: "s-keg", name: "Stout · ⅙ bbl keg", qty: "", include: true }]);
    expect(forms[1]).toMatchObject({ wholesaleBbl: "12.75", lines: [{ skuId: "s-keg", name: "Stout · ⅙ bbl keg", qty: "", include: true }] });
  });

  it("builds release_sku from the ticked lines: a pool for a batch, a whole quantity for stock", () => {
    const [form] = batchReleaseForms(rows);
    const unticked = { ...form, lines: [form.lines[0], { ...form.lines[1], include: false }] };
    expect(releaseCommand(unticked)).toEqual({
      name: "release_sku", reason: null,
      input: { batchId: "b1", wholesaleBbl: 12.75, shipsFrom: "2026-12-04", ordersCloseOn: "2026-11-27", lines: [{ skuId: "s-keg" }] },
    });
    // The pool is above zero and within the planned batch.
    expect(releaseCommand({ ...form, wholesaleBbl: "" }).reason).toMatch(/barrels open to wholesale above zero/);
    expect(releaseCommand({ ...form, wholesaleBbl: "18" }).reason).toMatch(/no more than the 17 bbl planned/);
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

  it("reads and edits a release with a pool: barrels left in the batch, an optional package limit", () => {
    const pooled: ReleaseRow = { ...release, qty: null, confirmed: 4, preordered: 0, remaining: 20, pool_bbl: 12.75, pool_left_bbl: 3.4, planned_bbl: 17 };
    expect(releaseDetail(pooled)).toBe("3.4 of 12.75 bbl left in the batch · 20 more of this package · 4 confirmed · ships Dec 4, 2026 · order by Nov 27, 2026");
    expect(releaseDetail({ ...pooled, qty: 30 })).toMatch(/20 more of this package \(limit 30\)/);
    // A blank limit is none; an unchanged pool is not sent.
    expect(updateReleaseCommand(pooled, "", "2026-11-27", "12.75")).toEqual({ name: "update_release", input: { releaseId: "r1", qty: null, ordersCloseOn: "2026-11-27" }, reason: null });
    expect(updateReleaseCommand(pooled, "30", "", "10").input).toEqual({ releaseId: "r1", qty: 30, ordersCloseOn: null, wholesaleBbl: 10 });
    expect(updateReleaseCommand(pooled, "", "", "20").reason).toMatch(/no more than the 17 bbl planned/);
  });
});

describe("release forms skip what is already released", () => {
  it("leaves a batch's released packages out of its form, and marks it released once all are", () => {
    const [partly] = batchReleaseForms(rows, [release]);
    expect(partly.released).toBe(false);
    expect(partly.lines.map((l) => l.skuId)).toEqual(["s-case"]);
    expect(partly.detail).toBe("ready Dec 4, 2026 · 17 bbl · 2 packages · 1 released");
    // A batch form with one package left still names it, and asks for barrels, not units.
    const html = renderToStaticMarkup(createElement(ReleaseView, { form: partly }));
    expect(html).toMatch(/Stout · case/);
    expect(html).toMatch(/Open to wholesale \(bbl\)/);
    expect(html).not.toMatch(/quantity/i);
    const [all] = batchReleaseForms(rows, [release, { ...release, id: "r2", sku_id: "s-case" }]);
    expect(all.released).toBe(true);
  });

  it("does not offer a SKU a batch it already has an open release from", () => {
    const forms = skuReleaseForms({ id: "s-keg", name: "Stout · ⅙ bbl keg" }, rows, "2026-11-18", [release]);
    expect(forms.map((f) => f.key)).toEqual(["stock"]);
  });
});
