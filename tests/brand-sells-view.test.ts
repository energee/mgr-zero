// Sells as: the Brand page's switch per packaged format, its contents and pours, and the command a switch sends.
import { describe, expect, it } from "vitest";
import { sellsAsCommand, toBrandSellsModel, type BrandSellsSnapshot } from "@/lib/mgr/brand-sells-view";

const GROUP = "g1";
const channels = [{ id: "dtc", name: "DTC" }, { id: "wh", name: "Wholesale" }];
const formats = [
  { id: "case", name: "Case", components: [{ parent_format_id: "case", child_format_id: "four", qty: 6 }] },
  { id: "four", name: "Four Pack", components: [] },
  { id: "sixtel", name: "Sixtel (one-way)", components: [] },
];
const prices = [
  { sale_channel_id: "dtc", price_group_id: GROUP, format_id: "case", unit_price_cents: 2200 },
  { sale_channel_id: "wh", price_group_id: GROUP, format_id: "case", unit_price_cents: 1800 },
  { sale_channel_id: "dtc", price_group_id: GROUP, format_id: "four", unit_price_cents: 450 },
  { sale_channel_id: "dtc", price_group_id: GROUP, format_id: "pint", unit_price_cents: 700 },
  { sale_channel_id: "dtc", price_group_id: "other", format_id: "sixtel", unit_price_cents: 9900 },
];
const brand = (over: Partial<BrandSellsSnapshot["brand"]> = {}): BrandSellsSnapshot["brand"] => ({
  id: "b1",
  price_group_id: GROUP,
  skus: [
    { id: "s-case", format_id: "case", active: true, upc: "012345678905" },
    { id: "s-six", format_id: "sixtel", active: false, upc: null },
  ],
  pours: [{ id: "pint", name: "Pint", ounces: "16" }],
  ...over,
});

describe("toBrandSellsModel", () => {
  it("draws one row per packaged format, on when an active SKU exists", () => {
    const { packages } = toBrandSellsModel({ brand: brand(), formats, prices, channels });
    expect(packages.map((p) => [p.name, p.on, p.skuId])).toEqual([
      ["Case", true, "s-case"],
      ["Four Pack", false, undefined],
      ["Sixtel (one-way)", false, "s-six"],
    ]);
    expect(packages[0]!.upc).toBe("012345678905");
  });

  it("prices a row across channels in order, skipping unpriced channels and other groups", () => {
    const { packages } = toBrandSellsModel({ brand: brand(), formats, prices, channels });
    expect(packages.map((p) => p.prices)).toEqual(["DTC $22.00 · Wholesale $18.00", "DTC $4.50", "Unpriced"]);
  });

  it("lists a composed format's children only while it is switched on", () => {
    const on = toBrandSellsModel({ brand: brand(), formats, prices, channels });
    expect(on.contents).toEqual([{ key: "case:four", label: "Four Pack · 6 per Case", prices: "DTC $4.50" }]);
    const off = toBrandSellsModel({ brand: brand({ skus: [{ id: "s-case", format_id: "case", active: false, upc: null }] }), formats, prices, channels });
    expect(off.contents).toEqual([]);
  });

  it("shows the group's pours with their size and prices, and links to the price groups", () => {
    const model = toBrandSellsModel({ brand: brand(), formats, prices, channels });
    expect(model.pours).toEqual([{ key: "pint", name: "Pint", size: "16 oz", prices: "DTC $7.00" }]);
    expect(model.priceGroupHref).toBe("/pricing");
    expect(model.unpriced).toBe(false);
  });

  it("marks a brand with no price group unpriced, with no pours or prices", () => {
    const model = toBrandSellsModel({ brand: brand({ price_group_id: null, pours: [] }), formats, prices, channels });
    expect(model.unpriced).toBe(true);
    expect(model.pours).toEqual([]);
    expect(model.packages.map((p) => p.prices)).toEqual(["Unpriced", "Unpriced", "Unpriced"]);
  });
});

describe("sellsAsCommand", () => {
  const rows = toBrandSellsModel({ brand: brand(), formats, prices, channels }).packages;
  const [caseRow, fourRow, sixtelRow] = rows as [typeof rows[number], typeof rows[number], typeof rows[number]];

  it("creates the SKU when the format has none", () => {
    expect(sellsAsCommand(fourRow, true, "b1")).toEqual({ name: "create_sku", input: { brandId: "b1", formatId: "four" } });
  });

  it("turns an inactive SKU back on", () => {
    expect(sellsAsCommand(sixtelRow, true, "b1")).toEqual({ name: "update_sku", input: { skuId: "s-six", active: true, upc: "" } });
  });

  it("turns a SKU off and keeps its UPC", () => {
    expect(sellsAsCommand(caseRow, false, "b1")).toEqual({ name: "update_sku", input: { skuId: "s-case", active: false, upc: "012345678905" } });
  });
});
