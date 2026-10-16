import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "@/lib/commands/registry";
import type * as Qbo from "@/lib/qbo";
import type * as IntegrationTokens from "@/lib/supabase/integration-tokens";

const state = vi.hoisted(() => ({
  signedIn: true,
  member: true,
  customerId: "customer-1",
  seenCustomer: "",
  configured: true,
  confirmed: true,
  expired: false,
  requests: 0,
  admissionError: false,
  transport: vi.fn<typeof globalThis.fetch>(),
  admission: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.customerId }) }) }));
vi.mock("@/lib/auth/request-context", () => ({
  createRequestAuthContext: () => ({
    getIdentity: async () => state.signedIn ? { userId: "actor-1", email: "buyer@test.local" } : null,
    getCustomerMemberships: async () => state.member ? [
      { breweryId: "brewery-1", customerId: "customer-1" },
      { breweryId: "brewery-1", customerId: "customer-2" },
    ] : [],
    getScopedSupabaseClient: async () => ({ rpc: state.admission }),
  }),
}));

vi.mock("@/lib/supabase/integration-tokens", async (importOriginal) => ({
  ...await importOriginal<typeof IntegrationTokens>(),
  readPortalInvoicePayment: async (ctx: { customerId: string }, id: string) => {
    state.seenCustomer = ctx.customerId;
    if (id === "foreign") throw new CommandError("invoice not found", 404, "not_found");
    return state.configured ? {
      connectionId: "connection-1", realmId: "realm-1", remoteInvoiceId: "remote-1",
      accessToken: "access-secret", refreshToken: "refresh-secret", credentialVersion: 1,
      grantedScopes: ["com.intuit.quickbooks.accounting"],
      accessExpiresAt: state.expired ? "2020-01-01T00:00:00Z" : null,
      refreshExpiresAt: null, refreshHardExpiresAt: null,
    } : null;
  },
  confirmPortalInvoicePayment: async () => state.confirmed,
  compareAndSwapPortalInvoicePaymentTokens: async () => true,
}));

vi.mock("@/lib/qbo", async (importOriginal) => {
  const qbo = await importOriginal<typeof Qbo>();
  const config = {
    clientId: "client", clientSecret: "secret", redirectUri: "https://mgr.test/oauth",
    apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
  };
  return {
    ...qbo,
    qboConfig: () => config,
    QboOAuthClient: class extends qbo.QboOAuthClient {
      constructor() { super(config, state.transport); }
    },
  };
});

import { GET } from "@/app/(portal)/portal/invoices/[id]/pay/route";

const paymentUrl = "https://connect.intuit.com/pay/bearer-secret";
const pay = (id = "invoice-1") => GET(new Request(`https://mgr.test/portal/invoices/${id}/pay`), {
  params: Promise.resolve({ id }),
});

function setup() {
  state.signedIn = true;
  state.member = true;
  state.customerId = "customer-1";
  state.seenCustomer = "";
  state.configured = true;
  state.confirmed = true;
  state.expired = false;
  state.requests = 0;
  state.admissionError = false;
  state.admission.mockReset().mockImplementation(async () => ({
    data: [{ allowed: ++state.requests <= 120, retry_after: state.requests <= 120 ? 0 : 60 }],
    error: state.admissionError ? { code: "XX000", message: "admission failed" } : null,
  }));
  state.transport.mockReset().mockImplementation(async () => Response.json({
    Invoice: { Id: "remote-1", InvoiceLink: paymentUrl },
  }));
}
setup();

describe("portal invoice Pay route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setup();
  });

  it("returns to the shared invoice failure surface without a bearer link", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    state.configured = false;
    const response = await pay();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/portal/invoices/invoice-1?payment=unavailable");
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(console.info).toHaveBeenCalledWith("qbo_payment_unavailable", { reason: "not_configured" });
    expect(state.admission).not.toHaveBeenCalled();
    expect(state.transport).not.toHaveBeenCalled();
  });

  it("returns a no-store redirect only after the payment broker approves it", async () => {
    const response = await pay();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(paymentUrl);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(state.admission).toHaveBeenCalledExactlyOnceWith("consume_command_admission");
    expect(state.transport).toHaveBeenCalledOnce();
  });

  it("uses the same safe surface without logging raw provider errors", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.transport.mockRejectedValue(new Error("provider-secret bearer-secret access-secret"));
    const response = await pay();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/portal/invoices/invoice-1?payment=unavailable");
    expect(await response.text()).toBe("");
    expect(console.error).toHaveBeenCalledWith("qbo_payment_failed", "QuickBooks is unavailable");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("bounds repeated authorized requests before any additional provider read or refresh", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    for (let i = 0; i < 120; i++) expect((await pay()).status).toBe(302);
    // Even an expired credential must not refresh once this user's shared budget is spent.
    state.expired = true;
    for (let i = 0; i < 5; i++) {
      const response = await pay();
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://mgr.test/portal/invoices/invoice-1?payment=unavailable");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(await response.text()).toBe("");
    }
    expect(state.admission).toHaveBeenCalledTimes(125);
    expect(state.transport).toHaveBeenCalledTimes(120);
    expect(console.info).toHaveBeenCalledWith("qbo_payment_unavailable", { reason: "rate_limited" });
  });

  it("fails closed before provider work when admission is unavailable", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.admissionError = true;
    expect((await pay()).status).toBe(303);
    expect(state.transport).not.toHaveBeenCalled();
  });

  it("spends one admission for the bounded unauthorized-read refresh and retry", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    state.transport
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await pay()).status).toBe(303);
    expect(state.admission).toHaveBeenCalledOnce();
    expect(state.transport).toHaveBeenCalledTimes(3);
    expect(state.transport.mock.calls.map(([, init]) => init?.method)).toEqual(["GET", "POST", "GET"]);
  });

  it("does not log raw refresh errors or leak them to the buyer", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.expired = true;
    state.transport.mockRejectedValue(new Error("refresh-secret private-provider-detail"));
    expect((await pay()).status).toBe(303);
    expect(state.transport).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith("qbo_payment_refresh_failed", "QuickBooks is unavailable");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("rejects unauthenticated requests before admission or provider access", async () => {
    state.signedIn = false;
    const response = await pay();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/login");
    expect(state.admission).not.toHaveBeenCalled();
    expect(state.transport).not.toHaveBeenCalled();
  });

  it("rejects missing customer membership before admission or provider access", async () => {
    state.member = false;
    const response = await pay();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/no-membership");
    expect(state.admission).not.toHaveBeenCalled();
    expect(state.transport).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign invoice before admission even when the budget is exhausted", async () => {
    state.requests = 120;
    const response = await pay("foreign");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Invoice not found");
    expect(state.admission).not.toHaveBeenCalled();
    expect(state.transport).not.toHaveBeenCalled();
  });

  it("pays from the selected verified customer account", async () => {
    state.customerId = "customer-2";
    await pay("invoice-2");
    expect(state.seenCustomer).toBe("customer-2");
  });

  it("still refuses a link when authorization changes during the provider read", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    state.transport.mockImplementation(async () => {
      state.confirmed = false;
      return Response.json({ Invoice: { Id: "remote-1", InvoiceLink: paymentUrl } });
    });
    const response = await pay();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).not.toContain("bearer-secret");
    expect(console.info).toHaveBeenCalledWith("qbo_payment_unavailable", { reason: "context_changed" });
  });
});
