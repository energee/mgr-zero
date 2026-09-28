import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/registry";

const state = vi.hoisted(() => ({
  result: { kind: "unavailable", reason: "not_configured" } as
    { kind: "unavailable"; reason: string } | { kind: "redirect"; url: string },
  error: null as unknown,
  customerId: "customer-1",
  seenCustomer: "",
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.customerId }) }) }));

vi.mock("@/lib/auth/request-context", () => ({
  createRequestAuthContext: () => ({
    getIdentity: async () => ({ userId: "actor-1", email: "buyer@test.local" }),
    getCustomerMemberships: async () => [{ breweryId: "brewery-1", customerId: "customer-1" }, { breweryId: "brewery-1", customerId: "customer-2" }],
    getScopedSupabaseClient: async () => ({ marker: "scoped" }),
  }),
}));

vi.mock("@/lib/qbo", () => ({
  qboConfig: () => ({}),
  QboOAuthClient: class {},
  resolvePortalInvoicePayment: async (ctx: { customerId: string }) => {
    state.seenCustomer = ctx.customerId;
    if (state.error) throw state.error;
    return state.result;
  },
}));

import { GET } from "@/app/(portal)/portal/invoices/[id]/pay/route";

describe("portal invoice Pay route", () => {
  afterEach(() => {
    state.result = { kind: "unavailable", reason: "not_configured" };
    state.error = null;
    state.customerId = "customer-1";
    vi.restoreAllMocks();
  });

  it("returns to the shared invoice failure surface without a bearer link", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await GET(new Request("https://mgr.test/portal/invoices/invoice-1/pay"), {
      params: Promise.resolve({ id: "invoice-1" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/portal/invoices/invoice-1?payment=unavailable");
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(console.info).toHaveBeenCalledWith("qbo_payment_unavailable", { reason: "not_configured" });
  });

  it("returns a no-store redirect only after the payment broker approves it", async () => {
    state.result = { kind: "redirect", url: "https://pay.example.test/session/bearer-secret" };
    const response = await GET(new Request("https://mgr.test/portal/invoices/invoice-1/pay"), {
      params: Promise.resolve({ id: "invoice-1" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://pay.example.test/session/bearer-secret");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("uses the same safe surface when the provider throws", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    state.error = new Error("provider-secret");
    const response = await GET(new Request("https://mgr.test/portal/invoices/invoice-1/pay"), { params: Promise.resolve({ id: "invoice-1" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/portal/invoices/invoice-1?payment=unavailable");
    expect(await response.text()).not.toContain("provider-secret");
  });

  it("returns 404 for an invoice outside the customer scope", async () => {
    state.error = new CommandError("invoice not found", 404, "not_found");
    const response = await GET(new Request("https://mgr.test/portal/invoices/foreign/pay"), {
      params: Promise.resolve({ id: "foreign" }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Invoice not found");
  });
  it("pays from the selected verified customer account", async () => {
    state.customerId = "customer-2";
    await GET(new Request("https://mgr.test/portal/invoices/invoice-2/pay"), { params: Promise.resolve({ id: "invoice-2" }) });
    expect(state.seenCustomer).toBe("customer-2");
  });

});
