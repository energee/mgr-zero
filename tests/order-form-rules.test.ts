import { describe, expect, it } from "vitest";
import { orderFormReadiness } from "@/lib/order-form-rules";

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

  it("taproom transfer needs to-location instead of customer and ship-to", () => {
    const base = { kind: "taproom_transfer" as const, customerId: "", shipToId: "", fromLocationId: "l1", toLocationId: "l2", lines: [line], catalog };
    expect(orderFormReadiness(base).submittable).toBe(true);
    expect(orderFormReadiness({ ...base, toLocationId: "" }).submittable).toBe(false);
  });

  it("an empty catalog yields a hint naming what to create first", () => {
    const empty = { kind: "wholesale" as const, customerId: "", shipToId: "", fromLocationId: "", toLocationId: "", lines: [{ skuId: "", qty: "" }] };
    expect(orderFormReadiness({ ...empty, catalog: { customers: 0, locations: 0, skus: 0 } }).hint)
      .toBe("Before creating an order, add a customer, a location and a SKU.");
    expect(orderFormReadiness({ ...empty, catalog: { customers: 0, locations: 1, skus: 1 } }).hint)
      .toBe("Before creating an order, add a customer.");
    expect(orderFormReadiness({ ...empty, catalog: { customers: 1, locations: 0, skus: 0 } }).hint)
      .toBe("Before creating an order, add a location and a SKU.");
    // A transfer does not need a customer.
    expect(orderFormReadiness({ ...empty, kind: "taproom_transfer", catalog: { customers: 0, locations: 1, skus: 1 } }).hint).toBeNull();
  });
});
