import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(),
}));
const session = vi.hoisted(() => ({ breweryCookie: "brewery-1" as string | undefined, role: "admin" }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => session.breweryCookie ? { value: session.breweryCookie } : undefined) })),
}));

vi.mock("@/lib/brewery", () => ({
  getActiveBrewery: vi.fn(async () => ({ id: "brewery-1", name: "Fixture brewery", role: session.role })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "actor-1" } } })) },
  })),
}));

vi.mock("@/lib/supabase/integration-tokens", () => ({
  claimQboOAuth: lifecycle.claim,
  completeQboOAuthStore: lifecycle.complete,
  failQboOAuth: lifecycle.fail,
}));

import { GET } from "@/app/api/integrations/qbo/oauth/route";

describe("QuickBooks OAuth callback route", () => {
  beforeEach(() => {
    session.breweryCookie = "brewery-1";
    session.role = "admin";
    vi.stubEnv("QBO_CLIENT_ID", "client-id");
    vi.stubEnv("QBO_CLIENT_SECRET", "client-secret");
    vi.stubEnv("QBO_REDIRECT_URI", "https://mgr.test/api/integrations/qbo/oauth");
    vi.stubEnv("QBO_API_BASE", "https://sandbox-quickbooks.api.intuit.com");
    lifecycle.claim.mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: ["com.intuit.quickbooks.accounting"] });
    lifecycle.fail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns unavailable and does not claim a callback realm denied by CompanyInfo", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Fault: { Detail: "access-secret" } }), { status: 403 }));
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request(
      "https://mgr.test/api/integrations/qbo/oauth?code=secret-code&state=opaque&realmId=known-victim-realm",
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/settings/accounting?error=oauth");
    expect(lifecycle.complete).not.toHaveBeenCalled();
    expect(lifecycle.fail).toHaveBeenCalledWith("intent-1", "actor-1");
    expect(JSON.stringify([...response.headers])).not.toMatch(/access-secret|refresh-secret|secret-code/);
  });

  it("uses claimed scopes when the successful token response omits optional scope", async () => {
    vi.stubEnv("QBO_TAX_API_BASE", "https://qb-sandbox.api.intuit.com/graphql");
    const requestedScopes = ["com.intuit.quickbooks.accounting", "indirect-tax.tax-calculation.quickbooks"];
    lifecycle.claim.mockResolvedValue({
      intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes,
    });
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request(
      "https://mgr.test/api/integrations/qbo/oauth?code=secret-code&state=opaque&realmId=realm-1",
    ));

    expect(response.headers.get("location")).toBe("https://mgr.test/settings/accounting?connected=1");
    expect(lifecycle.complete).toHaveBeenCalledWith("intent-1", "actor-1", "realm-1",
      expect.objectContaining({ grantedScopes: requestedScopes }));
  });

  it("rejects invalid state before provider fetch", async () => {
    lifecycle.claim.mockResolvedValue(null);
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request(
      "https://mgr.test/api/integrations/qbo/oauth?code=secret-code&state=invalid&realmId=realm-1",
    ));

    expect(response.headers.get("location")).toBe("https://mgr.test/settings/accounting?error=oauth");
    expect(fetch).not.toHaveBeenCalled();
    expect(lifecycle.complete).not.toHaveBeenCalled();
  });

  it("uses the verified membership default when an Admin returns without a brewery cookie", async () => {
    session.breweryCookie = undefined;
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request(
      "https://mgr.test/api/integrations/qbo/oauth?code=secret-code&state=opaque&realmId=realm-1",
    ));

    expect(response.headers.get("location")).toBe("https://mgr.test/settings/accounting?connected=1");
    expect(lifecycle.claim).toHaveBeenCalledWith(expect.any(String), "actor-1", "brewery-1", expect.any(String));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a stale brewery cookie", "brewery-2", "admin"],
    ["a non-Admin membership", "brewery-1", "sales"],
  ])("rejects %s before claiming state or fetching QuickBooks", async (_label, cookie, role) => {
    session.breweryCookie = cookie;
    session.role = role;
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request(
      "https://mgr.test/api/integrations/qbo/oauth?code=secret-code&state=opaque&realmId=realm-1",
    ));

    expect(response.headers.get("location")).toBe("https://mgr.test/settings/accounting?error=oauth");
    expect(lifecycle.claim).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
