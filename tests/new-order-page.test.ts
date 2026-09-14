import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
import NewOrderPage from "@/app/(app)/orders/new/page";
import { NewOrderClient } from "@/app/(app)/orders/new/new-order-client";

beforeEach(() => { query.mockReset(); permission.mockReset(); });

it("guards new-order deep links before loading customer and catalog data", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect(NewOrderPage()).rejects.toThrow("denied");
  expect(permission).toHaveBeenCalledWith({ breweryId: "brewery" }, "create_order", "New order");
  expect(query).not.toHaveBeenCalled();
});

it("defers option reads to the cached client after the permission guard", async () => {
  const page = await NewOrderPage();
  expect(page.type).toBe(NewOrderClient);
  expect(permission).toHaveBeenCalledWith({ breweryId: "brewery" }, "create_order", "New order");
  expect(query).not.toHaveBeenCalled();
});
