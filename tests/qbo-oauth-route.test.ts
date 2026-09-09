import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  claim: vi.fn(), complete: vi.fn(), fail: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: "brewery-1" })) })),
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
    vi.stubEnv("QBO_CLIENT_ID", "client-id");
    vi.stubEnv("QBO_CLIENT_SECRET", "client-secret");
    vi.stubEnv("QBO_REDIRECT_URI", "https://mgr.test/api/integrations/qbo/oauth");
    vi.stubEnv("QBO_API_BASE", "https://sandbox-quickbooks.api.intuit.com");
    lifecycle.claim.mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect" });
    lifecycle.fail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns unavailable and does not claim a callback realm rejected by CompanyInfo", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "actual-realm" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request(
      "https://mgr.test/api/integrations/qbo/oauth?code=secret-code&state=opaque&realmId=known-victim-realm",
    ));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://mgr.test/settings?qbo=unavailable");
    expect(lifecycle.complete).not.toHaveBeenCalled();
    expect(lifecycle.fail).toHaveBeenCalledWith("intent-1", "actor-1");
    expect(JSON.stringify([...response.headers])).not.toMatch(/access-secret|refresh-secret|secret-code/);
  });
});
