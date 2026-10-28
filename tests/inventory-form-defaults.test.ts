// Defaults and entry points that save taps on the inventory and purchasing
// forms (#1507): the count bin, the New PO material order, the New transfer
// To location, a single receive source, SKU detail's Record movement and the
// customer keg balance's Record return.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InventoryDetailView } from "@/components/mgr/views/inventory-detail";
import { KegBalanceView } from "@/components/mgr/views/keg-balance";
import { E } from "@/components/mgr/e";
import { countDefaultBin } from "@/lib/mgr/cycle-count-view";
import { vendorMaterialsFirst } from "@/lib/mgr/new-po-view";
import { onlyOtherLocation } from "@/lib/mgr/new-transfer-view";
import { transferSourceQty } from "@/lib/mgr/transfer-detail-view";
import { toKegBalanceViewProps } from "@/lib/mgr/keg-balance-view";
import { kegBalanceRidgeline } from "@/lib/mgr/fixtures/kegs";
import { toInventoryDetailViewProps } from "@/lib/mgr/inventory-detail-view";

describe("Cycle count default bin", () => {
  const locations = [{ id: "a", name: "Brewhouse" }, { id: "b", name: "Cold storage" }];
  const bins = [{ id: "a1", location_id: "a", name: "Cold" }, { id: "a2", location_id: "a", name: "Dry" }, { id: "b1", location_id: "b", name: "Walk-in" }];

  it("starts on the bin holding the most of the material", () => {
    const onHand = [{ location_id: "a", bin_id: "a1", qty: 5 }, { location_id: "b", bin_id: "b1", qty: 40 }, { location_id: "a", bin_id: "a2", qty: 10 }];
    expect(countDefaultBin(onHand, locations, bins)).toEqual({ locationId: "b", binId: "b1" });
  });

  it("falls back to the first location's first bin when no listed bin holds any", () => {
    expect(countDefaultBin([], locations, bins)).toEqual({ locationId: "a", binId: "a1" });
    expect(countDefaultBin([{ location_id: "b", bin_id: "b1", qty: 0 }], locations, bins)).toEqual({ locationId: "a", binId: "a1" });
    expect(countDefaultBin([{ location_id: "gone", bin_id: "g1", qty: 9 }], locations, bins)).toEqual({ locationId: "a", binId: "a1" });
  });
});

describe("New PO material order", () => {
  const materials = [
    { id: "m1", name: "Cascade", default_vendor_id: "hops" },
    { id: "m2", name: "Pale malt", default_vendor_id: "malt" },
    { id: "m3", name: "Yeast", default_vendor_id: null },
    { id: "m4", name: "Wheat malt", default_vendor_id: "malt" },
  ];

  it("lists the chosen vendor's materials first, each run still alphabetical", () => {
    expect(vendorMaterialsFirst(materials, "malt").map(m => m.id)).toEqual(["m2", "m4", "m1", "m3"]);
  });

  it("keeps the list as it is before a vendor is chosen", () => {
    expect(vendorMaterialsFirst(materials, "")).toEqual(materials);
  });
});

describe("New transfer To location", () => {
  it("is the one location other than From", () => {
    expect(onlyOtherLocation([{ id: "a" }, { id: "b" }], "a")).toBe("b");
  });

  it("stays unchosen when more than one other location exists", () => {
    expect(onlyOtherLocation([{ id: "a" }, { id: "b" }, { id: "c" }], "a")).toBe("");
  });
});

describe("Transfer receive sources", () => {
  it("prefill the whole picked quantity when the line has one source", () => {
    expect(transferSourceQty(undefined, 1, 12)).toBe("12");
  });

  it("wait for typed quantities when the line has several sources", () => {
    expect(transferSourceQty(undefined, 2, 12)).toBe("");
  });

  it("keep what was typed, even a cleared field", () => {
    expect(transferSourceQty("4", 1, 12)).toBe("4");
    expect(transferSourceQty("", 1, 12)).toBe("");
  });
});

describe("SKU detail", () => {
  it("draws the header action beside the SKU name", () => {
    const model = toInventoryDetailViewProps({ sku: { id: "s", name: "Hazy IPA keg", active: true }, onHand: [], atp: [], movements: [], timeZone: "America/New_York" });
    const html = renderToStaticMarkup(createElement(InventoryDetailView, { model, headerAction: E.btn("Record movement", "p", "/inventory?recordMovement=1&skuId=s") }));
    expect(html).toContain('href="/inventory?recordMovement=1&amp;skuId=s"');
    expect(html).toContain("Record movement");
  });
});

describe("Customer keg balance", () => {
  it("puts each live row's action beside its deposit", () => {
    const model = toKegBalanceViewProps({ customer: "Al's Bar", kegs: "4 kegs", deposits: "$120 deposits held", rows: [{ key: "p-half", title: "Owned ½ bbl", detail: "4 out", trailing: "$120" }] });
    const html = renderToStaticMarkup(createElement(KegBalanceView, { model, rowActions: { "p-half": createElement("button", null, "Record return") } }));
    expect(html).toContain("$120");
    expect(html).toContain("Record return");
  });

  it("draws the inventory's Record return inert on the pool rows", () => {
    const html = renderToStaticMarkup(createElement(KegBalanceView, { model: toKegBalanceViewProps(kegBalanceRidgeline) }));
    expect(html.match(/>Record return<\/button>/g)).toHaveLength(2);
    expect(html).toContain("$1,020");
  });
});
