// Execute the draft-edit server adapter to prove permissions, state gates and option scope.
import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); }, notFound: () => { throw new Error("not found"); } }));

const params = Promise.resolve({ id: "order" });
const order = { id: "order", order_no: 42, kind: "wholesale", status: "draft", customer_id: "customer", sale_channel_id: "frozen-channel", ship_to_id: "ship", requested_ship_date: "2026-10-12", po_number: "PO42", customers: { name: "Buyer" } };
beforeEach(() => {
  query.mockReset(); permission.mockReset();
  query.mockImplementation(async name => name === "get_order" ? { order, lines: [{ sku_id: "sku", qty_ordered: 2, skus: { name: "Saved SKU" } }] } : name === "get_customer" ? { customer: { sale_channel_id: "channel" }, shipTos: [{ id: "ship", label: "Dock" }] } : [{ id: "sku", name: "Saved SKU", brands: null }]);
});
it("offers every active SKU for transfers even when the order carries an unpriced sale channel", async () => {
  query.mockImplementation(async name => name === "get_order" ? { order: { ...order, kind: "taproom_transfer", customer_id: null, sale_channel_id: "transfer-channel" }, lines: [{ sku_id: "unpriced", qty_ordered: 2 }] } : [{ id: "unpriced", name: "Unpriced active", brands: null }]);
  const result = await (await page())({ params });
  expect(query).toHaveBeenCalledWith("list_skus", { active: true }, expect.anything());
  expect(result.props.model.skus).toEqual([{ id: "unpriced", label: "Unpriced active" }]);
});
async function page() { return (await import("@/app/(app)/orders/[id]/edit/page")).default; }
it("guards edit permission before any reads", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect((await page())({ params })).rejects.toThrow("denied");
  expect(permission).toHaveBeenCalledWith(expect.anything(), "update_draft_order", "Edit draft");
  expect(query).not.toHaveBeenCalled();
});
it.each(["submitted", "confirmed", "picked", "shipped", "cancelled"])("redirects %s before loading edit options", async status => {
  query.mockResolvedValue({ order: { ...order, status }, lines: [] });
  await expect((await page())({ params })).rejects.toThrow("/orders/order");
  expect(query).toHaveBeenCalledTimes(1);
});
it("prefills persisted headers and lines, scopes options to the frozen order channel after the customer channel changes", async () => {
  const result = await (await page())({ params });
  expect(result.props.orderId).toBe("order");
  expect(result.props.model).toMatchObject({ shipToId: "ship", requestedShipDate: "2026-10-12", poNumber: "PO42", lines: [{ skuId: "sku", qty: "2" }] });
  expect(query).toHaveBeenCalledWith("list_skus", { saleChannelId: "frozen-channel", active: true }, expect.anything());
});
