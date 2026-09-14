import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ pending: false, fetching: false, paused: false, error: null as Error | null, calls: [] as [string, unknown][] }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: (name: string, input: unknown) => {
  state.calls.push([name, input]);
  const data = name === "list_customers" ? [{ id: "customer", name: "Buyer", shipTos: [{ id: "dock", label: "Dock", is_default: true }] }]
    : name === "list_skus" ? [{ id: "sku", name: "Keg", active: true, brands: { name: "Brand" } }, { id: "old", active: false }]
    : [];
  return { data: state.pending ? undefined : data, error: state.error, isPending: state.pending, isFetching: state.fetching, isPaused: state.paused, dataUpdatedAt: state.pending ? 0 : Date.parse("2026-09-13T12:00:00Z"), refetch: vi.fn() };
} }));
import { NewOrderClient } from "@/app/(app)/orders/new/new-order-client";
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import { OrderForm } from "@/app/(app)/orders/order-form";
import { QueryFeedback } from "@/components/mgr/query-feedback";

beforeEach(() => { state.pending = false; state.fetching = false; state.paused = false; state.error = null; state.calls = []; });

it("feeds the existing order form cached live IDs, default ship-to and active SKUs", () => {
  const form = NewOrderClient();
  expect(form.type).toBe(OrderForm);
  expect(form.props.customers[0].shipTos[0]).toMatchObject({ id: "dock", is_default: true });
  expect(form.props.skus).toEqual([{ id: "sku", label: "Brand — Keg" }]);
  expect(state.calls).toEqual([["list_customers", { includeShipTos: true }], ["list_locations", {}], ["list_skus", {}]]);
});

it("keeps cached form data mounted when a background refresh fails", () => {
  state.error = new Error("Could not refresh");
  expect(NewOrderClient().type).toBe(OrderForm);
});

it("feeds the existing form shared freshness feedback without replacing the form during refresh", () => {
  state.fetching = true;
  const form = NewOrderClient();
  expect(form.type).toBe(OrderForm);
  expect(form.props.feedback.type).toBe(QueryFeedback);
  const feedback = renderToStaticMarkup(form.props.feedback);
  expect(feedback).toContain("Updating");
  expect(feedback).toContain("Last checked");
  expect(feedback).not.toContain('role="status"');
  state.paused = true;
  expect(renderToStaticMarkup(NewOrderClient().props.feedback)).toContain("Showing last-known data");
});

it("does not describe a cold cache as empty data or render skeletons", () => {
  state.pending = true;
  const html = renderToStaticMarkup(NewOrderClient());
  expect(html).toContain("Loading order options");
  expect(html).not.toMatch(/animate-pulse|No customers|Go to/);
  const orders = renderToStaticMarkup(OrdersClient({ role: "sales" }));
  expect(orders).toContain("Loading orders");
  expect(orders).not.toContain("No orders yet");
});

it("preserves customer filters and read-only Warehouse controls", () => {
  const html = renderToStaticMarkup(OrdersClient({ role: "warehouse", status: "draft", customerId: "buyer" }));
  expect(state.calls).toEqual([["list_orders", { status: "draft", customerId: "buyer" }]]);
  expect(html).toContain("customerId=buyer");
  expect(html).not.toContain("New order");
});

it("shows when cached orders were checked, and keeps them visible while updating", () => {
  state.fetching = true;
  const html = renderToStaticMarkup(OrdersClient({ role: "sales" }));
  expect(html).toContain("Updating");
  expect(html).toContain("Last checked");
  expect(html).toContain('dateTime="2026-09-13T12:00:00.000Z"');
  expect(html).toContain("New order");
  expect(html).not.toContain("Loading orders");
});

it("distinguishes offline cached data from a cold cache waiting for a connection", () => {
  state.paused = true;
  const cached = renderToStaticMarkup(OrdersClient({ role: "sales" }));
  expect(cached).toContain("Waiting for connection");
  expect(cached).toContain("Showing last-known data");
  state.pending = true;
  const cold = renderToStaticMarkup(OrdersClient({ role: "sales" }));
  expect(cold).toContain("Waiting for connection");
  expect(cold).not.toMatch(/Loading orders|Showing last-known data|No orders yet/);
});

it("labels a failed refresh as last-known data instead of presenting it as current", () => {
  state.error = new Error("Could not refresh");
  const html = renderToStaticMarkup(OrdersClient({ role: "sales" }));
  expect(html).toContain("Showing last-known data");
  expect(html).toContain("Try again");
  expect(html).toContain("Last checked");
});
