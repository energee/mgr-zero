import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); }, notFound: () => { throw new Error("not found"); } }));
import PickPage from "@/app/(app)/orders/[id]/pick/page";
import { PickForm } from "@/app/(app)/orders/[id]/pick-form";

const params = Promise.resolve({ id: "order" });
const order = { id: "order", order_no: 42, status: "confirmed", from_location_id: "source", customers: { name: "Customer" } };
const line = { id: "line", sku_id: "sku", qty_ordered: 5, qty_picked: null, skus: { name: "Exact SKU" } };
beforeEach(() => {
  query.mockReset(); permission.mockReset();
  query.mockImplementation(async name => name === "get_order" ? { order, lines: [line] } : [{ id: "source", name: "Actual cooler" }]);
});

it("guards the Pick deep link before reading data", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect(PickPage({ params })).rejects.toThrow("denied");
  expect(permission.mock.calls.map(call => call[1])).toEqual(["record_pick"]);
  expect(query).not.toHaveBeenCalled();
});

it("passes real identity and source to the shared page adapter", async () => {
  const pick = await PickPage({ params });
  expect(pick.type).toBe(PickForm);
  expect(pick.props.snapshot).toMatchObject({ order, lines: [line], locations: [{ id: "source", name: "Actual cooler" }], backHref: "/orders/order" });
});

it("maps the latest existing short_pick event to only its matching line", async () => {
  query.mockImplementation(async name => name === "get_order" ? { order, lines: [line, { ...line, id: "other" }], events: [
    { id: "old", created_at: "2026-10-02T01:00:00Z", event: "short_pick", payload: { line_id: "line" } },
    { id: "new", created_at: "2026-10-02T02:00:00Z", event: "short_pick", payload: { line_id: "line" } },
    { id: "foreign", created_at: "2026-10-02T03:00:00Z", event: "picked", payload: { line_id: "other" } },
  ] } : []);
  const page = await PickPage({ params });
  expect(page.props.snapshot.lines).toEqual([{ ...line, shortPickEventId: "new" }, { ...line, id: "other" }]);
});

it("redirects terminal orders", async () => {
  query.mockImplementation(async name => name === "get_order" ? { order: { ...order, status: "shipped" }, lines: [line] } : []);
  await expect(PickPage({ params })).rejects.toThrow("/orders/order");
});
