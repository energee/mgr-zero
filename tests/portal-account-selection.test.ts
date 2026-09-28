import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ picked: "second", memberships: [
  { customerId: "first", breweryId: "brewery", breweryName: "Brewery", customerName: "First" },
  { customerId: "second", breweryId: "brewery", breweryName: "Brewery", customerName: "Second" },
] }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.picked }) }) }));
vi.mock("@/lib/auth/request-context", () => ({ getRequestIdentity: async () => ({ userId: "buyer" }), getCustomerMemberships: async () => state.memberships }));
import { getActiveCustomer } from "@/lib/portal";
beforeEach(() => { state.picked = "second"; });
it("opens the selected verified customer rather than the first membership", async () => {
  expect((await getActiveCustomer()).customerId).toBe("second");
});
it("ignores a cookie naming an account the buyer does not belong to", async () => {
  state.picked = "unowned";
  expect((await getActiveCustomer()).customerId).toBe("first");
});
