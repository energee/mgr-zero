import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
import NewOrderPage from "@/app/(app)/orders/new/page";
import { OrderForm, type CustomerOption } from "@/app/(app)/orders/order-form";

beforeEach(() => { query.mockReset(); permission.mockReset(); });

it("guards new-order deep links before loading customer and catalog data", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect(NewOrderPage()).rejects.toThrow("denied");
  expect(permission).toHaveBeenCalledWith({ breweryId: "brewery" }, "create_order", "New order");
  expect(query).not.toHaveBeenCalled();
});

it("binds the full-page form to live IDs and active SKUs without fixture availability", async () => {
  query.mockImplementation(async (name, input) => {
    if (name === "list_customers") return [{ id: "c1", name: "Same" }, { id: "c2", name: "Same" }];
    if (name === "list_locations") return [{ id: "l1", name: "Warehouse", uses: ["warehouse"] }];
    if (name === "list_skus") return [
      { id: "sku1", name: "Case", active: true, brands: { name: "Brand" } },
      { id: "sku2", name: "Old", active: false, brands: null },
    ];
    if (name === "get_customer") return { shipTos: [{ id: `${input.customerId}-dock`, label: "Dock", is_default: true }] };
    throw new Error(name);
  });
  const page = await NewOrderPage();
  expect(page.type).toBe(OrderForm);
  expect(page.props.customers.map((customer: CustomerOption) => [customer.id, customer.shipTos[0].id])).toEqual([["c1", "c1-dock"], ["c2", "c2-dock"]]);
  expect(page.props.skus).toEqual([{ id: "sku1", label: "Brand — Case" }]);
});
