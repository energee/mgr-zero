import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ pending: false, fetching: false, paused: false, error: null as Error | null, calls: [] as [string, unknown][] }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: (name: string, input: unknown) => {
  state.calls.push([name, input]);
  const data = name === "list_customers" ? [{ id: "customer", name: "Buyer", shipTos: [{ id: "dock", label: "Dock", is_default: true }] }]
    : name === "list_skus" ? [{ id: "sku", name: "Keg", active: true, brands: { name: "Brand" } }, { id: "old", active: false }]
    : name === "list_orders" ? { rows: [], nextCursor: null }
    : name === "get_brewery" ? { portal_fulfillment_location_id: "warehouse" } : [];
  return { data: state.pending ? undefined : data, error: state.error, isPending: state.pending, isFetching: state.fetching, isPaused: state.paused, dataUpdatedAt: state.pending ? 0 : Date.parse("2026-09-13T12:00:00Z"), refetch: vi.fn() };
} }));
// The Orders Status pick navigates with the app router; outside Next it needs a stand-in.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/orders" }));
import { NewOrderClient } from "@/app/(app)/orders/new/new-order-client";
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import { OrderForm } from "@/app/(app)/orders/order-form";
import { QueryFeedback } from "@/components/mgr/query-feedback";

const timeZone = "America/Los_Angeles";
beforeEach(() => { state.pending = false; state.fetching = false; state.paused = false; state.error = null; state.calls = []; });

it("feeds the existing order form cached live IDs and the default ship-to", () => {
  const form = NewOrderClient({ timeZone });
  expect(form.type).toBe(OrderForm);
  expect(form.props.customers[0].shipTos[0]).toMatchObject({ id: "dock", is_default: true });
  expect(form.props.skus).toEqual([expect.objectContaining({ id: "sku" })]);
  expect(state.calls).toEqual([["list_customers", { includeShipTos: true }], ["list_locations", {}], ["list_skus", {}], ["get_brewery", {}]]);
  // Source starts on the portal fulfillment warehouse when there are several locations (#1506).
  expect(form.props.fulfillmentLocationId).toBe("warehouse");
});

it("keeps cached form data mounted when a background refresh fails", () => {
  state.error = new Error("Could not refresh");
  expect(NewOrderClient({ timeZone }).type).toBe(OrderForm);
});

it("keeps option-refresh feedback without a Last checked timestamp on an unsaved order", () => {
  state.fetching = true;
  const form = NewOrderClient({ timeZone });
  expect(form.type).toBe(OrderForm);
  expect(form.props.feedback.type).toBe(QueryFeedback);
  expect(form.props.timeZone).toBe(timeZone);
  expect(form.props.feedback.props.timeZone).toBe(timeZone);
  const feedback = renderToStaticMarkup(form.props.feedback);
  expect(feedback).toContain("Updating");
  expect(feedback).not.toContain("Last checked");
  expect(feedback).not.toContain('role="status"');
  state.paused = true;
  expect(renderToStaticMarkup(NewOrderClient({ timeZone }).props.feedback)).toContain("Showing last-known data");
});

it("shows no freshness label on a blank, settled new order", () => {
  expect(renderToStaticMarkup(NewOrderClient({ timeZone }).props.feedback)).toBe("");
});

it("does not describe a cold cache as empty data or render skeletons", () => {
  state.pending = true;
  const html = renderToStaticMarkup(NewOrderClient({ timeZone }));
  expect(html).toContain("Loading order options");
  expect(html).not.toMatch(/animate-pulse|No customers|Go to/);
  const orders = renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone }));
  expect(orders).toContain("Loading orders");
  expect(orders).not.toContain("No orders yet");
});

it("preserves customer filters and read-only Warehouse controls", () => {
  const html = renderToStaticMarkup(OrdersClient({ roles: ["warehouse"], timeZone, status: "draft", customerId: "buyer" }));
  expect(state.calls).toEqual([["list_orders", { status: "draft", customerId: "buyer", cursor: undefined }]]);
  // The customer scope line's Clear keeps the status; each Status option keeps the customer (tests/orders-list-view.test.ts).
  expect(html).toContain("Customer: <strong");
  expect(html).toContain('href="/orders?status=draft"');
  expect(html).not.toContain("New order");
});

it("carries the customer filter into New order (#1506)", () => {
  expect(renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone, customerId: "buyer" }))).toContain('href="/orders/new?customerId=buyer"');
  expect(renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone }))).toContain('href="/orders/new"');
});

it("combines sales' create control with brewer's production navigation", () => {
  const html = renderToStaticMarkup(OrdersClient({ roles: ["brewer", "sales"], timeZone }));
  expect(html).toContain("New order");
  expect(html).toContain('href="/batches"');
  expect(html).toContain('href="/orders"');
  expect(html).not.toContain('href="/routes"');
});

it("shows when cached orders were checked, and keeps them visible while updating", () => {
  state.fetching = true;
  const html = renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone }));
  expect(html).toContain("Updating");
  expect(html).toContain("Last checked");
  expect(html).toContain('dateTime="2026-09-13T12:00:00.000Z"');
  expect(html).toContain("New order");
  expect(html).not.toContain("Loading orders");
});

it("distinguishes offline cached data from a cold cache waiting for a connection", () => {
  state.paused = true;
  const cached = renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone }));
  expect(cached).toContain("Waiting for connection");
  expect(cached).toContain("Showing last-known data");
  state.pending = true;
  const cold = renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone }));
  expect(cold).toContain("Waiting for connection");
  expect(cold).not.toMatch(/Loading orders|Showing last-known data|No orders yet/);
});

it("labels a failed refresh as last-known data instead of presenting it as current", () => {
  state.error = new Error("Could not refresh");
  const html = renderToStaticMarkup(OrdersClient({ roles: ["sales"], timeZone }));
  expect(html).toContain("Showing last-known data");
  expect(html).toContain("Try again");
  expect(html).toContain("Last checked");
});
