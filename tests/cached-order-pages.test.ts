import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const state = vi.hoisted(() => ({ pending: false, error: null as Error | null, calls: [] as [string, unknown][] }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: (name: string, input: unknown) => {
  state.calls.push([name, input]);
  const data = name === "list_customers" ? [{ id: "customer", name: "Buyer", shipTos: [{ id: "dock", label: "Dock", is_default: true }] }]
    : name === "list_skus" ? [{ id: "sku", name: "Keg", active: true, brands: { name: "Brand" } }, { id: "old", active: false }]
    : [];
  return { data: state.pending ? undefined : data, error: state.error, isPending: state.pending, refetch: vi.fn() };
} }));
import { NewOrderClient } from "@/app/(app)/orders/new/new-order-client";
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import { OrderForm } from "@/app/(app)/orders/order-form";

beforeEach(() => { state.pending = false; state.error = null; state.calls = []; });

it("feeds the existing order form cached live IDs, default ship-to and active SKUs", () => {
  const node = NewOrderClient();
  const form = node.props.children[1];
  expect(form.type).toBe(OrderForm);
  expect(form.props.customers[0].shipTos[0]).toMatchObject({ id: "dock", is_default: true });
  expect(form.props.skus).toEqual([{ id: "sku", label: "Brand — Keg" }]);
  expect(state.calls).toEqual([["list_customers", { includeShipTos: true }], ["list_locations", {}], ["list_skus", {}]]);
});

it("keeps cached form data mounted when a background refresh fails", () => {
  state.error = new Error("Could not refresh");
  expect(NewOrderClient().props.children[1].type).toBe(OrderForm);
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
