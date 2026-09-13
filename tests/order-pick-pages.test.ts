import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); }, notFound: () => { throw new Error("not found"); } }));
import PickPage from "@/app/(app)/orders/[id]/pick/page";
import ShortPickPage from "@/app/(app)/orders/[id]/short-pick/page";
import { PickForm } from "@/app/(app)/orders/[id]/pick-form";
import { ShortPickForm } from "@/app/(app)/orders/[id]/short-pick-form";

const params = Promise.resolve({ id: "order" });
const order = { id: "order", order_no: 42, status: "confirmed", from_location_id: "source", customers: { name: "Customer" } };
const line = { id: "line", sku_id: "sku", qty_ordered: 5, qty_picked: null, skus: { name: "Exact SKU" } };
beforeEach(() => {
  query.mockReset(); permission.mockReset();
  query.mockImplementation(async name => name === "get_order" ? { order, lines: [line] } : [{ id: "source", name: "Actual cooler" }]);
});

it("guards both deep links before reading data", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect(PickPage({ params })).rejects.toThrow("denied");
  await expect(ShortPickPage({ params, searchParams: Promise.resolve({ line: "line", qty: "1" }) })).rejects.toThrow("denied");
  expect(permission.mock.calls.map(call => call[1])).toEqual(["record_pick", "resolve_short_pick"]);
  expect(query).not.toHaveBeenCalled();
});

it("passes real identity, source and decimal count to the shared page adapters", async () => {
  const pick = await PickPage({ params });
  expect(pick.type).toBe(PickForm);
  expect(pick.props.snapshot).toMatchObject({ order, lines: [line], locations: [{ id: "source", name: "Actual cooler" }], backHref: "/orders/order" });
  const short = await ShortPickPage({ params, searchParams: Promise.resolve({ line: "line", qty: "1.5" }) });
  expect(short.type).toBe(ShortPickForm);
  expect(short.props.snapshot.line).toEqual({ ...line, qty_picked: 1.5 });
  expect(short.props.snapshot.backHref).toBe("/orders/order/pick");
});

it.each(["", "NaN", "Infinity", "-1", "5", "6"])("rejects invalid or non-short count %s", async qty => {
  await expect(ShortPickPage({ params, searchParams: Promise.resolve({ line: "line", qty }) })).rejects.toThrow("/orders/order/pick");
});

it("rejects a line outside the order and redirects terminal orders", async () => {
  await expect(ShortPickPage({ params, searchParams: Promise.resolve({ line: "foreign", qty: "1" }) })).rejects.toThrow("not found");
  query.mockImplementation(async name => name === "get_order" ? { order: { ...order, status: "shipped" }, lines: [line] } : []);
  await expect(PickPage({ params })).rejects.toThrow("/orders/order");
  await expect(ShortPickPage({ params, searchParams: Promise.resolve({ line: "line", qty: "1" }) })).rejects.toThrow("/orders/order");
});
