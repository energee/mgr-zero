import { describe, expect, it } from "vitest";
import { initialOrderChoices, isUnavailableSku, orderFormReadiness, skuPickerChannel, toSkuOption } from "@/lib/order-form-rules";

const catalog = { customers: 1, locations: 1, skus: 1 };
const line = { skuId: "sku-1", qty: "12" };

describe("orderFormReadiness", () => {
  it("is not submittable with nothing chosen", () => {
    const r = orderFormReadiness({
      kind: "wholesale", customerId: "", shipToId: "", fromLocationId: "", toLocationId: "",
      lines: [{ skuId: "", qty: "" }], catalog,
    });
    expect(r.submittable).toBe(false);
    expect(r.hint).toBeNull();
  });

  it("wholesale needs customer, ship-to, from-location and one complete line", () => {
    const base = { kind: "wholesale" as const, customerId: "c1", shipToId: "s1", fromLocationId: "l1", toLocationId: "", lines: [line], catalog };
    expect(orderFormReadiness(base).submittable).toBe(true);
    expect(orderFormReadiness({ ...base, shipToId: "" }).submittable).toBe(false);
    expect(orderFormReadiness({ ...base, customerId: "" }).submittable).toBe(false);
    expect(orderFormReadiness({ ...base, fromLocationId: "" }).submittable).toBe(false);
    expect(orderFormReadiness({ ...base, lines: [{ skuId: "sku-1", qty: "0" }] }).submittable).toBe(false);
    expect(orderFormReadiness({ ...base, lines: [{ skuId: "", qty: "3" }] }).submittable).toBe(false);
    // One complete line is enough even when a blank row sits beside it.
    expect(orderFormReadiness({ ...base, lines: [{ skuId: "", qty: "" }, line] }).submittable).toBe(true);
  });

  it.each([
    { skuId: "sku-2", qty: "" },
    { skuId: "", qty: "3" },
    { skuId: "sku-2", qty: "0" },
    { skuId: "sku-2", qty: "-1" },
    { skuId: "sku-2", qty: "not a number" },
    { skuId: "sku-2", qty: "Infinity" },
  ])("blocks an entered invalid row beside a complete line: %j", partial => {
    const input = { kind: "wholesale" as const, customerId: "c1", shipToId: "s1", fromLocationId: "l1", toLocationId: "", lines: [line, partial], catalog };
    expect(orderFormReadiness(input).submittable).toBe(false);
  });

  it("rejects unavailable selections even beside a complete eligible line", () => {
    const base = { kind: "wholesale" as const, customerId: "c1", shipToId: "s1", fromLocationId: "l1", toLocationId: "", lines: [line], catalog };
    expect(orderFormReadiness({ ...base, availableSkuIds: [] }).submittable).toBe(false);
    expect(orderFormReadiness({ ...base, lines: [line, { skuId: "other", qty: "2" }], availableSkuIds: ["other"] }).submittable).toBe(false);
    expect(orderFormReadiness({ ...base, availableSkuIds: [line.skuId] }).submittable).toBe(true);
    expect(isUnavailableSku("", [])).toBe(false);
    expect(isUnavailableSku(line.skuId, [])).toBe(true);
    expect(isUnavailableSku(line.skuId, [line.skuId])).toBe(false);
  });

  it("taproom transfer needs to-location instead of customer and ship-to", () => {
    const base = { kind: "taproom_transfer" as const, customerId: "", shipToId: "", fromLocationId: "l1", toLocationId: "l2", lines: [line], catalog };
    expect(orderFormReadiness(base).submittable).toBe(true);
    expect(orderFormReadiness({ ...base, toLocationId: "" }).submittable).toBe(false);
  });

  it("an empty catalog yields a hint naming what to create first", () => {
    const empty = { kind: "wholesale" as const, customerId: "", shipToId: "", fromLocationId: "", toLocationId: "", lines: [{ skuId: "", qty: "" }] };
    expect(orderFormReadiness({ ...empty, catalog: { customers: 0, locations: 0, skus: 0 } }).hint)
      .toBe("Before creating an order, add a customer, a location, and a SKU.");
    expect(orderFormReadiness({ ...empty, catalog: { customers: 0, locations: 1, skus: 1 } }).hint)
      .toBe("Before creating an order, add a customer.");
    expect(orderFormReadiness({ ...empty, catalog: { customers: 1, locations: 0, skus: 0 } }).hint)
      .toBe("Before creating an order, add a location and a SKU.");
    // A transfer does not need a customer.
    expect(orderFormReadiness({ ...empty, kind: "taproom_transfer", catalog: { customers: 0, locations: 1, skus: 1 } }).hint).toBeNull();
    // The hint replaces Still needed; saving stays blocked.
    expect(orderFormReadiness({ ...empty, catalog: { customers: 0, locations: 1, skus: 1 } })).toMatchObject({ submittable: false, reason: null });
  });

  it("the hint's Go to sentence links only the pages where Sales can add what is missing (#1127)", () => {
    const empty = { kind: "wholesale" as const, customerId: "", shipToId: "", fromLocationId: "", toLocationId: "", lines: [{ skuId: "", qty: "" }] };
    const customers = { label: "Customers", href: "/customers" };
    const catalog = { label: "Catalog", href: "/catalog" };
    expect(orderFormReadiness({ ...empty, catalog: { customers: 0, locations: 0, skus: 0 } }).goTo).toEqual(["Go to ", customers, " or ", catalog, "."]);
    // A transfer never needs a customer, so it never links Customers.
    expect(orderFormReadiness({ ...empty, kind: "taproom_transfer", catalog: { customers: 0, locations: 0, skus: 0 } }).goTo).toEqual(["Go to ", catalog, "."]);
    // Only an admin can add a location (the Locations page offers Sales no Add), so a missing location is named in the hint but not linked.
    expect(orderFormReadiness({ ...empty, catalog: { customers: 1, locations: 0, skus: 1 } }).goTo).toEqual([]);
    expect(orderFormReadiness({ ...empty, catalog: { customers: 1, locations: 1, skus: 1 } }).goTo).toEqual([]);
  });
});

it("new-order destination prefers the default and falls back only when none is designated", async () => {
  const { defaultShipToId } = await import("../lib/order-form-rules");
  expect(defaultShipToId([{ id: "first" }, { id: "default", is_default: true }])).toBe("default");
  expect(defaultShipToId([{ id: "first" }, { id: "second" }])).toBe("first");
  expect(defaultShipToId([])).toBe("");
});

// #490: a wholesale order's SKU picker offers only what the customer's channel prices.
describe("SKU picker", () => {
  it("narrows to the chosen wholesale customer's sale channel, not a transfer's", () => {
    expect(skuPickerChannel("wholesale", { sale_channel_id: "wholesale" })).toBe("wholesale");
    expect(skuPickerChannel("wholesale", undefined)).toBeUndefined();
    expect(skuPickerChannel("taproom_transfer", { sale_channel_id: "wholesale" })).toBeUndefined();
  });
  it("labels a SKU with its brand when it has one", () => {
    expect(toSkuOption({ id: "s", name: "½ bbl", brands: { name: "Hazy IPA" } })).toEqual({ id: "s", label: "Hazy IPA · ½ bbl" });
    expect(toSkuOption({ id: "s", name: "½ bbl", brands: null })).toEqual({ id: "s", label: "½ bbl" });
  });
  it("does not repeat a brand already at the start of the SKU name", () => {
    expect(toSkuOption({ id: "s", name: "Hazy IPA · ½ bbl", brands: { name: "Hazy IPA" } })).toEqual({ id: "s", label: "Hazy IPA · ½ bbl" });
  });
});

describe("initialOrderChoices (#1506)", () => {
  const customers = [
    { id: "c1", shipTos: [{ id: "s1" }, { id: "s2", is_default: true }] },
    { id: "c2", shipTos: [] },
  ];
  const warehouse = { id: "l1" };

  it("starts with the linked customer and its default ship-to", () => {
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }], "c1")).toEqual({ customerId: "c1", shipToId: "s2", fromLocationId: "" });
  });

  it("ignores a customer id that is not one of the listed customers", () => {
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }], "gone")).toEqual({ customerId: "", shipToId: "", fromLocationId: "" });
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }])).toEqual({ customerId: "", shipToId: "", fromLocationId: "" });
  });

  it("preselects the source only when there is one location to choose", () => {
    expect(initialOrderChoices(customers, [warehouse]).fromLocationId).toBe("l1");
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }]).fromLocationId).toBe("");
  });

  it("with several locations, preselects the portal fulfillment warehouse when it is listed", () => {
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }], undefined, "l2").fromLocationId).toBe("l2");
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }], undefined, "gone").fromLocationId).toBe("");
    expect(initialOrderChoices(customers, [warehouse, { id: "l2" }], undefined, null).fromLocationId).toBe("");
    expect(initialOrderChoices(customers, [warehouse], undefined, "l2").fromLocationId).toBe("l1");
  });
});
