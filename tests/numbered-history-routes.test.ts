import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as [string, Record<string, unknown>][] }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: ["warehouse"], timeZone: "UTC" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ roles: ["warehouse"] }) }));
vi.mock("@/lib/portal", () => ({ getPortalContext: async () => ({ customer: { breweryName: "Brewery" }, ctx: { roles: ["customer"] } }) }));
vi.mock("@/lib/commands/registry", () => ({ runCommand: query, canRun: () => false }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, optionalPageQuery: query, requirePagePermission: vi.fn() }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: (name: string, input: Record<string, unknown>) => ({ data: query(name, input), refetch: vi.fn() }) }));
vi.mock("@/lib/qbo", () => ({ isQboConfigured: () => false }));

function query(name: string, input: Record<string, unknown>) {
  state.calls.push([name, input]);
  switch (name) {
    case "list_orders":
    case "list_invoices":
    case "list_batch_history":
    case "list_packaging_history":
    case "portal_orders":
    case "portal_invoices":
      return { rows: [], nextCursor: null, total: 200 };
    case "get_customer": return { customer: { name: "Buyer" } };
    case "get_gravity_unit": return { effective: "sg" };
    case "list_batches":
    case "list_brands":
    case "list_recipes":
    case "list_vessels":
    case "list_packaging_runs":
    case "list_occupancies":
    case "list_skus":
    case "list_locations":
    case "list_bins":
    case "list_repack_parents":
      return [];
    default: throw new Error(name);
  }
}

import OrdersPage from "@/app/(app)/orders/page";
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import InvoicesPage from "@/app/(app)/invoices/page";
import BatchesPage from "@/app/(app)/batches/page";
import PackagingPage from "@/app/(app)/packaging/page";
import PortalOrdersPage from "@/app/(portal)/portal/orders/page";
import PortalInvoicesPage from "@/app/(portal)/portal/invoices/page";

beforeEach(() => { state.calls = []; });

it("passes the staff Orders page and size to its cached query while retaining filters in navigation", async () => {
  const route = await OrdersPage({ searchParams: Promise.resolve({ page: "3", limit: "25", status: "picked", customerId: "buyer" }) });
  const view = OrdersClient(route.props);
  expect(state.calls).toContainEqual(["list_orders", { page: 3, limit: 25, status: "picked", customerId: "buyer" }]);
  expect(view.props.pagination).toMatchObject({ currentPage: 3, limit: 25 });
  const resized = new URL(view.props.pagination.sizeHrefs["10"], "https://mgr.test");
  expect(Object.fromEntries(resized.searchParams)).toEqual({ page: "1", limit: "10", status: "picked", customerId: "buyer" });
});

it("keeps invoice customer and unpaid filters in numbered navigation", async () => {
  const customerId = "00000000-0000-4000-8000-000000000001";
  const view = await InvoicesPage({ searchParams: Promise.resolve({ page: "3", limit: "25", status: "unpaid", customerId }) });
  expect(state.calls).toContainEqual(["list_invoices", { page: 3, limit: 25, status: "unpaid", customerId }]);
  expect(view.props.pagination).toMatchObject({ currentPage: 3, limit: 25 });
  const resized = new URL(view.props.pagination.sizeHrefs["100"], "https://mgr.test");
  expect(Object.fromEntries(resized.searchParams)).toEqual({ page: "1", limit: "100", status: "unpaid", customerId });
});

it.each([
  ["packaging", PackagingPage, "list_packaging_history"],
  ["portal orders", PortalOrdersPage, "portal_orders"],
  ["portal invoices", PortalInvoicesPage, "portal_invoices"],
] as const)("requests a server-backed page for %s", async (_label, route, command) => {
  const view = await route({ searchParams: Promise.resolve({ page: "3", limit: "25" }) });
  expect(state.calls).toContainEqual([command, { page: 3, limit: 25 }]);
  expect(view.props.pagination).toMatchObject({ currentPage: 3, limit: 25 });
  const resized = new URL(view.props.pagination.sizeHrefs["50"], "https://mgr.test");
  expect(Object.fromEntries(resized.searchParams)).toEqual({ page: "1", limit: "50" });
});

it("keeps both batch groups and the linked recipe when changing either group's page size", async () => {
  const view = await BatchesPage({ searchParams: Promise.resolve({ recipe: "recipe", completedPage: "3", completedLimit: "25", cancelledPage: "2", cancelledLimit: "10" }) });
  expect(state.calls).toContainEqual(["list_batch_history", { status: "completed", page: 3, limit: 25 }]);
  expect(state.calls).toContainEqual(["list_batch_history", { status: "cancelled", page: 2, limit: 10 }]);
  expect(view.props.cancelledOpen).toBe(true);
  const completedResize = new URL(view.props.completedPagination.sizeHrefs["100"], "https://mgr.test");
  expect(Object.fromEntries(completedResize.searchParams)).toEqual({ recipe: "recipe", completedPage: "1", completedLimit: "100", cancelledPage: "2", cancelledLimit: "10" });
  const cancelledResize = new URL(view.props.cancelledPagination.sizeHrefs["50"], "https://mgr.test");
  expect(Object.fromEntries(cancelledResize.searchParams)).toEqual({ recipe: "recipe", completedPage: "3", completedLimit: "25", cancelledPage: "1", cancelledLimit: "50" });
  const resized = await BatchesPage({ searchParams: Promise.resolve(Object.fromEntries(cancelledResize.searchParams)) });
  expect(resized.props.cancelledOpen).toBe(true);
});

it.each([
  {},
  { cancelledPage: "1" },
  { cancelledLimit: "50" },
])("opens cancelled batches only when explicitly browsing or resizing them: %j", async params => {
  const view = await BatchesPage({ searchParams: Promise.resolve(params) });
  expect(view.props.cancelledOpen).toBe(Object.keys(params).length > 0);
});
