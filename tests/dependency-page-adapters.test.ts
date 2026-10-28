import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ roles: ["warehouse"], calls: [] as [string, unknown][], gates: [] as [string, string | undefined][], source: null as { id: string; name: string } | null, locations: null as { id: string; name: string; uses: string[] }[] | null, reservations: null as { id: string; source: string; ref: string; qty: number; orderId?: string; orderNo?: number }[] | null }));
// The Orders Status pick navigates with the app router; outside Next it needs a stand-in.
vi.mock("next/navigation", async (original) => ({ ...await original<typeof import("next/navigation")>(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: state.roles, timeZone: "America/Los_Angeles" }) }));
vi.mock("@/lib/portal", () => {
  const customer = { breweryId: "brewery", customerId: "buyer", customerName: "Buyer" };
  return { getActiveCustomer: async () => customer, getPortalContext: async () => ({ customer, ctx: { roles: ["customer"] } }) };
});
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ roles: state.roles }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: (name: string, input: unknown) => {
  state.calls.push([name, input]);
  return { data: name === "list_customers" ? [{ id: "buyer", name: "Buyer", shipTos: [{ id: "ship", label: "Door", is_default: true }] }]
    : name === "list_skus" ? [{ id: "active", name: "Keg", active: true }, { id: "inactive", active: false }] : name === "list_orders" ? { rows: [], nextCursor: null } : [], error: null, refetch() {} };
} }));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandForm: () => ({ open: false, setOpen() {}, busy: false, error: "", submit() {} }) }));
vi.mock("@/lib/commands/registry", () => ({ runCommand: query }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, optionalPageQuery: query, requirePagePermission: (_ctx: unknown, name: string, resource?: string) => { state.gates.push([name, resource]); } }));
async function query(name: string, input: unknown) {
  state.calls.push([name, input]);
  switch (name) {
    case "daily_pick_sheet": return ["confirmed", "picked"].map((status, i) => ({ id: status, order_no: i + 1, status, requested_ship_date: null, customers: { name: status === "confirmed" ? "Needs picking" : "Already staged" }, order_lines: [{ id: "line", sku_id: "sku", qty_ordered: 4, qty_picked: status === "picked" ? 4 : null, skus: { name: "Keg" } }] }));
    case "list_orders": return { rows: [], nextCursor: null };
    case "list_customers": return [{ id: "buyer", name: "Buyer", shipTos: [{ id: "ship", label: "Door", is_default: true }] }];
    case "get_customer": return { customer: { name: "Buyer" }, shipTos: [{ id: "ship", label: "Door", is_default: true }] };
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
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import { NewOrderClient } from "@/app/(app)/orders/new/new-order-client";
import NewOrderPage from "@/app/(app)/orders/new/page";
import ReplenishmentPage from "@/app/(app)/replenishment/page";
import ShopPage from "@/app/(portal)/portal/page";

it("does not fetch customer options when Orders has no customer filter", async () => {
  state.calls = [];
  const page = await OrdersPage({ searchParams: Promise.resolve({}) });
  expect(state.calls).toEqual([]);
  OrdersClient(page.props);
  expect(state.calls).toEqual([["list_orders", { status: undefined, customerId: undefined, cursor: undefined }]]);
});

it("preserves customer filtering, default destinations, active SKUs and Warehouse readonly", async () => {
  state.roles = ["warehouse"]; state.calls = [];
  const readonly = OrdersClient((await OrdersPage({ searchParams: Promise.resolve({ customerId: "buyer", status: "draft" }) })).props);
  expect(readonly.props.createAction).toBeNull();
  expect(state.calls).toContainEqual(["list_orders", { customerId: "buyer", status: "draft", cursor: undefined }]);
  expect(state.calls).toContainEqual(["get_customer", { customerId: "buyer" }]);
  expect(readonly.props.model.statusOptions.every((o: { href: string }) => o.href.includes("customerId=buyer"))).toBe(true);
  expect(readonly.props.model.customer.name).toBe("Buyer");
  state.roles = ["sales"];
  // New order is its own route now; the list only links to it, and the route
  // itself carries the create_order gate and the picker options.
  const writable = OrdersClient((await OrdersPage({ searchParams: Promise.resolve({}) })).props);
  expect(renderToStaticMarkup(writable.props.createAction)).toContain('href="/orders/new"');
  // New order is its own page now; it owns the option lists and its own gate.
  state.calls = []; state.gates = [];
  const page = await NewOrderPage({ searchParams: Promise.resolve({}) });
  expect(page.type).toBe(NewOrderClient);
  const form = NewOrderClient(page.props);
  expect(form.props.timeZone).toBe("America/Los_Angeles");
  expect(form.props.feedback.props.timeZone).toBe("America/Los_Angeles");
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

it("names the location a standing allocation is held at, taproom or not", async () => {
  state.roles = ["warehouse"]; state.calls = [];
  state.locations = [{ id: "tap", name: "Taproom", uses: ["taproom"] }, { id: "shed", name: "Overflow shed", uses: ["storage"] }];
  state.reservations = [{ id: "standing", source: "taproom_standing", ref: "shed", qty: 2 }];
  const page = await ReplenishmentPage({ searchParams: Promise.resolve({ sku: "active" }) });
  expect(page.props.model.shortfalls[0].detail.rows[0]).toMatchObject({
    title: "Standing allocation · Overflow shed", detail: "2 keg reserved",
    href: "/replenishment?location=shed&sku=active#standing-allocations",
  });
  state.locations = null; state.reservations = null;
});

it("keeps global shortfall facts separate from taproom scope and Warehouse readonly", async () => {
  state.roles = ["warehouse"]; state.calls = [];
  const page = await ReplenishmentPage({ searchParams: Promise.resolve({ sku: "active", location: "not-a-taproom" }) });
  expect(state.calls).toContainEqual(["get_shortfalls", { skuId: "active" }]);
  expect(state.calls).toContainEqual(["list_standing_allocations", { locationId: "tap" }]);
  const model = page.props.model;
  expect(model.locationId).toBe("tap");
  expect(model.canEdit).toBe(false);
  expect(model.shortfalls[0]).toMatchObject({ onHand: 1, allocated: 3, atp: -2 });
  expect(model.shortfalls[0].detail.atp).toContain("−2 kegs");
  expect(model.shortfalls[0].detail.atp).toContain("−1 bbl");
  expect(model.shortfalls[0].detail.atpDetail).toContain("across all locations");
  expect(model.shortfalls[0].detail.rows[0]).toMatchObject({ title: "Order 42", href: "/orders/order", detail: "3 keg reserved" });
});

it("keeps the SKU when changing location and the location when clearing the SKU", async () => {
  state.roles = ["sales"];
  const page = await ReplenishmentPage({ searchParams: Promise.resolve({ sku: "active", location: "tap" }) });
  expect(page.props.model.locations).toEqual([{ value: "tap", label: "Taproom", href: "/replenishment?location=tap&sku=active" }]);
  expect(page.props.model.allShortfallsHref).toBe("/replenishment?location=tap#shortfalls");
  expect(page.props.model.canEdit).toBe(true);
});

it.each(["warehouse", "admin", "sales"])("renders the actual Orders page with the permitted create control for %s", async role => {
  state.roles = [role];
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
