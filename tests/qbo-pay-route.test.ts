import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/registry";

const state = vi.hoisted(() => ({
  result: { kind: "unavailable", reason: "not_configured" } as
    { kind: "unavailable"; reason: string } | { kind: "redirect"; url: string },
  error: null as unknown,
}));

vi.mock("@/lib/auth/request-context", () => ({
  createRequestAuthContext: () => ({
    getIdentity: async () => ({ userId: "actor-1", email: "buyer@test.local" }),
    getCustomerMemberships: async () => [{ breweryId: "brewery-1", customerId: "customer-1" }],
    getScopedSupabaseClient: async () => ({ marker: "scoped" }),
  }),
}));

vi.mock("@/lib/qbo", () => ({
  qboConfig: () => ({}),
  QboOAuthClient: class {},
  resolvePortalInvoicePayment: async () => {
    if (state.error) throw state.error;
    return state.result;
  },
}));

import { GET } from "@/app/(portal)/portal/invoices/[id]/pay/route";

describe("portal invoice Pay route", () => {
  afterEach(() => {
    state.result = { kind: "unavailable", reason: "not_configured" };
    state.error = null;
    vi.restoreAllMocks();
  });

  it("returns a useful no-store unavailable page without a bearer link", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await GET(new Request("https://mgr.test/portal/invoices/invoice-1/pay"), {
      params: Promise.resolve({ id: "invoice-1" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toMatch(/Payment unavailable[\s\S]*Online payment isn’t available[\s\S]*Return to invoice/);
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

  it("returns 404 for an invoice outside the customer scope", async () => {
    state.error = new CommandError("invoice not found", 404, "not_found");
    const response = await GET(new Request("https://mgr.test/portal/invoices/foreign/pay"), {
      params: Promise.resolve({ id: "foreign" }),
    });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Invoice not found");
  });
});
