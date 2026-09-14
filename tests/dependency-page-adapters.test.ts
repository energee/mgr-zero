import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ role: "warehouse", calls: [] as [string, unknown][], gates: [] as [string, string | undefined][], source: null as { id: string; name: string } | null, locations: null as { id: string; name: string; uses: string[] }[] | null, reservations: null as { id: string; source: string; ref: string; qty: number; orderId?: string; orderNo?: number }[] | null }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", role: state.role }) }));
vi.mock("@/lib/portal", () => ({ getActiveCustomer: async () => ({ breweryId: "brewery", customerId: "buyer", customerName: "Buyer" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ role: state.role }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ open: false, setOpen() {}, busy: false, error: "", submit() {} }) }));
vi.mock("@/lib/commands/registry", () => ({ runCommand: query }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: (_ctx: unknown, name: string, resource?: string) => { state.gates.push([name, resource]); } }));
async function query(name: string, input: unknown) {
  state.calls.push([name, input]);
  switch (name) {
    case "daily_pick_sheet": return ["confirmed", "picked"].map((status, i) => ({ id: status, order_no: i + 1, status, requested_ship_date: null, customers: { name: status === "confirmed" ? "Needs picking" : "Already staged" }, order_lines: [{ id: "line", sku_id: "sku", qty_ordered: 4, qty_picked: status === "picked" ? 4 : null, skus: { name: "Keg" } }] }));
    case "list_orders": return [];
    case "list_customers": return [{ id: "buyer", name: "Buyer", shipTos: [{ id: "ship", label: "Door", is_default: true }] }];
    case "get_customer": return { shipTos: [{ id: "ship", label: "Door", is_default: true }] };
    case "list_locations": return state.locations ?? [{ id: "tap", name: "Taproom", uses: ["taproom"] }];
    case "list_skus": return [{ id: "active", name: "Keg", active: true, formats: { name: "keg", package_type: "keg" }, format_volume: { bbl_per_unit: .5 } }, { id: "inactive", name: "Old", active: false }];
    case "get_shortfalls": return [{ skuId: "active", skuName: "Keg", onHand: 1, allocated: 3, atp: -2, reservations: state.reservations ?? [{ id: "reserve", source: "order_line", ref: "line", qty: 3, orderId: "order", orderNo: 42 }] }];
    case "list_standing_allocations": return [];
    case "replenishment_suggestions": return [];
    case "portal_catalog": return [];
    case "get_portal_account": return { membership: { userId: "actor" }, shipTos: [{ id: "ship", label: "Door", is_default: true, city: "Town", state: "PA" }], fulfillmentSource: state.source };
    default: throw new Error(name);
  }
}
import PickPage from "@/app/(app)/pick/page";
import OrdersPage from "@/app/(app)/orders/page";
import NewOrderPage from "@/app/(app)/orders/new/page";
import ReplenishmentPage from "@/app/(app)/replenishment/page";
import ShopPage from "@/app/(portal)/portal/page";

it("does not fetch customer options when Orders has no customer filter", async () => {
  state.calls = [];
  await OrdersPage({ searchParams: Promise.resolve({}) });
  expect(state.calls).toEqual([["list_orders", { status: undefined, customerId: undefined }]]);
});

it("preserves customer filtering, default destinations, active SKUs and Warehouse readonly", async () => {
  state.role = "warehouse"; state.calls = [];
  const readonly = await OrdersPage({ searchParams: Promise.resolve({ customerId: "buyer", status: "draft" }) });
  expect(readonly.props.createAction).toBeNull();
  expect(state.calls).toContainEqual(["list_orders", { customerId: "buyer", status: "draft" }]);
  expect(renderToStaticMarkup(readonly.props.filters)).toContain("customerId=buyer");
  state.role = "sales";
  // New order is its own route now; the list only links to it, and the route
  // itself carries the create_order gate and the picker options.
  const writable = await OrdersPage({ searchParams: Promise.resolve({}) });
  expect(renderToStaticMarkup(writable.props.createAction)).toContain('href="/orders/new"');
  // New order is its own page now; it owns the option lists and its own gate.
  state.calls = []; state.gates = [];
  const form = await NewOrderPage();
  expect(state.gates).toContainEqual(["create_order", "New order"]);
  expect(form.props.skus.map((s: { id: string }) => s.id)).toEqual(["active"]);
  expect(form.props.customers[0].shipTos[0].is_default).toBe(true);
});
it("slots the scoped recoverable Cart with the actual configured source or no source", async () => {
  for (const source of [null, { id: "source", name: "Cold room" }]) {
    state.source = source;
    // The page now returns the Cart itself; Cart mounts ShopView with a real
    // adapter instead of the page passing a hollow model through a slot.
    const shop = await ShopPage({ searchParams: Promise.resolve({}) });
    expect(shop.props).toMatchObject({ fulfillmentSource: source, scope: { actorId: "actor", customerId: "buyer", breweryId: "brewery" }, shipTos: [{ id: "ship", is_default: true, label: "Door (Town, PA)" }] });
    // Cart is the root now and owns the ShopView mount; the recovery scope
    // still has to remount it per actor/customer/brewery/draft.
    expect(shop.key).toBe("actor:buyer:brewery:new");
    expect(shop.props.customerName).toBe("Buyer");
  }
});

// A standing allocation may be held at any location — set_standing_allocation
// asks for no particular use — so the shortfall card names the place it is held
// even when that place is not a taproom. Reading only the taprooms showed a raw id.
it("names the location a standing allocation is held at, taproom or not", async () => {
  state.role = "warehouse"; state.calls = [];
  state.locations = [{ id: "tap", name: "Taproom", uses: ["taproom"] }, { id: "shed", name: "Overflow shed", uses: ["storage"] }];
  state.reservations = [{ id: "standing", source: "taproom_standing", ref: "shed", qty: 2 }];
  const page = await ReplenishmentPage({ searchParams: Promise.resolve({ sku: "active" }) });
  const model = page.props.children[1][0].props.children.props.model;
  expect(model.rows[0]).toMatchObject({ title: "Standing allocation · Overflow shed", detail: "2 keg reserved" });
  state.locations = null; state.reservations = null;
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

it.each(["warehouse", "admin", "sales"])("renders the actual Orders page with the permitted create control for %s", async role => {
  state.role = role;
  const html = renderToStaticMarkup(await OrdersPage({ searchParams: Promise.resolve({}) }));
  if (role === "warehouse") expect(html).not.toMatch(/New order|New Order/);
  else expect(html).toMatch(/New order|New Order/);
});
it("keeps confirmed and picked states visible on the rendered printable pick sheet", async () => {
  const html = renderToStaticMarkup(await PickPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("confirmed · 1 line");
  expect(html).toContain("picked · 1 line");
  expect(html).toContain("Needs picking");
  expect(html).toContain("Already staged");
});
