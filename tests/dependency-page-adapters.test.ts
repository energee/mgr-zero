import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ role: "warehouse", calls: [] as [string, unknown][], source: null as { id: string; name: string } | null }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", role: state.role }) }));
vi.mock("@/lib/portal", () => ({ getActiveCustomer: async () => ({ breweryId: "brewery", customerId: "buyer", customerName: "Buyer" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ role: state.role }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/commands/registry", () => ({ runCommand: query }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query }));
async function query(name: string, input: unknown) {
  state.calls.push([name, input]);
  switch (name) {
    case "list_orders": return [];
    case "list_customers": return [{ id: "buyer", name: "Buyer" }];
    case "get_customer": return { shipTos: [{ id: "ship", label: "Door", is_default: true }] };
    case "list_locations": return [{ id: "tap", name: "Taproom", kind: "taproom" }];
    case "list_skus": return [{ id: "active", name: "Keg", active: true, formats: { name: "keg", package_type: "keg" }, format_volume: { bbl_per_unit: .5 } }, { id: "inactive", name: "Old", active: false }];
    case "get_shortfalls": return [{ skuId: "active", skuName: "Keg", onHand: 1, allocated: 3, atp: -2, reservations: [{ id: "reserve", source: "order_line", ref: "line", qty: 3, orderId: "order", orderNo: 42 }] }];
    case "list_standing_allocations": return [];
    case "replenishment_suggestions": return [];
    case "portal_catalog": return [];
    case "get_portal_account": return { membership: { userId: "actor" }, shipTos: [{ id: "ship", label: "Door", is_default: true, city: "Town", state: "PA" }], fulfillmentSource: state.source };
    default: throw new Error(name);
  }
}
import OrdersPage from "@/app/(app)/orders/page";
import ReplenishmentPage from "@/app/(app)/replenishment/page";
import ShopPage from "@/app/(portal)/portal/page";

it("preserves customer filtering, default destinations, active SKUs and Warehouse readonly", async () => {
  state.role = "warehouse"; state.calls = [];
  const readonly = await OrdersPage({ searchParams: Promise.resolve({ customerId: "buyer", status: "draft" }) });
  expect(readonly.props.createAction).toBeUndefined();
  expect(state.calls).toContainEqual(["list_orders", { customerId: "buyer", status: "draft" }]);
  expect(renderToStaticMarkup(readonly.props.filters)).toContain("customerId=buyer");
  state.role = "sales";
  const writable = await OrdersPage({ searchParams: Promise.resolve({}) });
  expect(writable.props.createAction.props.skus.map((s: { id: string }) => s.id)).toEqual(["active"]);
  expect(writable.props.createAction.props.customers[0].shipTos[0].is_default).toBe(true);
});
it("slots the scoped recoverable Cart with the actual configured source or no source", async () => {
  for (const source of [null, { id: "source", name: "Cold room" }]) {
    state.source = source;
    const shop = await ShopPage({ searchParams: Promise.resolve({}) });
    expect(shop.props.catalog.props).toMatchObject({ fulfillmentSource: source, scope: { actorId: "actor", customerId: "buyer", breweryId: "brewery" }, shipTos: [{ id: "ship", is_default: true, label: "Door (Town, PA)" }] });
    expect(shop.props.footer).toBeNull();
    expect(shop.props.catalog.key).toBe("actor:buyer:brewery:new");
  }
});

it("renders the selected shortfall with actual package volume and competing order", async () => {
  state.role = "warehouse"; state.calls = [];
  const page = await ReplenishmentPage({ searchParams: Promise.resolve({ sku: "active", location: "not-a-taproom" }) });
  expect(state.calls).toContainEqual(["get_shortfalls", { skuId: "active" }]);
  expect(state.calls).toContainEqual(["list_standing_allocations", { locationId: "tap" }]);
  const section = page.props.children[1][0];
  const model = section.props.children.props.model;
  expect(model.atp).toContain("−2 kegs");
  expect(model.atp).toContain("−1 bbl");
  expect(model.atpDetail).toContain("across all locations");
  expect(model.rows[0]).toMatchObject({ title: "Order 42", href: "/orders/order", detail: "3 keg reserved" });
  const controls = page.props.children[4].props.children;
  expect(controls[0]).toBe(false);
  expect(controls[1].props.canCreate).toBe(false);
});
