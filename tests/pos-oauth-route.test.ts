import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({ claim: vi.fn(), complete: vi.fn(), fail: vi.fn() }));
const session = vi.hoisted(() => ({ breweryCookie: "brewery-1" as string | undefined, role: "admin" }));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => session.breweryCookie ? { value: session.breweryCookie } : undefined) })),
}));
vi.mock("@/lib/brewery", () => ({
  getActiveBrewery: vi.fn(async () => ({ id: "brewery-1", name: "Fixture", role: session.role })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "actor-1" } } })) } })),
}));
vi.mock("@/lib/supabase/integration-tokens", () => ({
  claimSquareOAuth: lifecycle.claim, completeSquareOAuthStore: lifecycle.complete, failSquareOAuth: lifecycle.fail,
}));

import { GET } from "@/app/api/integrations/square/oauth/route";

describe("Square OAuth callback", () => {
  beforeEach(() => {
    session.breweryCookie = "brewery-1";
    session.role = "admin";
    vi.stubEnv("SQUARE_APPLICATION_ID", "sandbox-app");
    vi.stubEnv("SQUARE_APPLICATION_SECRET", "sandbox-secret");
    vi.stubEnv("SQUARE_REDIRECT_URI", "https://mgr.test/api/integrations/square/oauth");
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
    lifecycle.claim.mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect" });
    lifecycle.fail.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it.each([
    ["wrong brewery", "brewery-2", "admin"],
    ["wrong current role", "brewery-1", "warehouse"],
  ])("rejects %s before state claim or provider fetch", async (_label, breweryCookie, role) => {
    session.breweryCookie = breweryCookie;
    session.role = role;
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    const response = await GET(new Request("https://mgr.test/api/integrations/square/oauth?code=secret&state=opaque"));

    expect(response.headers.get("location")).toBe("https://mgr.test/settings/pos?error=oauth");
    expect(lifecycle.claim).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid durable state before provider fetch", async () => {
    lifecycle.claim.mockResolvedValue(null);
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    await GET(new Request("https://mgr.test/api/integrations/square/oauth?code=secret&state=bad"));

    expect(fetch).not.toHaveBeenCalled();
    expect(lifecycle.complete).not.toHaveBeenCalled();
  });
});
