import { describe, expect, it, vi } from "vitest";
import { completeQboOAuth, QboOAuthClient, sanitizeQboError } from "@/lib/qbo";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
};

describe("QuickBooks OAuth transport", () => {
  it("uses the exact registered redirect and exchanges through native fetch without leaking credentials", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      x_refresh_token_expires_in: 8640000,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const qbo = new QboOAuthClient(config, fetch);
    const authorize = new URL(qbo.authorizeUrl("opaque-state"));
    expect(authorize.origin + authorize.pathname).toBe("https://appcenter.intuit.com/connect/oauth2");
    expect(authorize.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(authorize.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");

    const tokens = await qbo.exchange("one-time-code");
    expect(tokens).toMatchObject({ accessToken: "access-secret", refreshToken: "refresh-secret", accessExpiresIn: 3600 });
    const [, init] = fetch.mock.calls[0];
    expect(init?.body?.toString()).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
    expect(JSON.stringify(tokens)).toContain("access-secret");
  });

  it("refreshes with rotated credentials and treats missing hard expiry as unknown", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600,
      x_refresh_token_expires_in: 8640000,
    }), { status: 200 }));
    const tokens = await new QboOAuthClient(config, fetch).refresh("old-refresh");
    expect(tokens.refreshToken).toBe("next-refresh");
    expect(tokens.refreshHardExpiresIn).toBeNull();
  });

  it("revokes with the maintained JSON contract and sanitizes provider failures", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await new QboOAuthClient(config, fetch).revoke("refresh-secret");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ token: "refresh-secret" }) });
    expect(sanitizeQboError(new Error("failed access-secret refresh-secret"))).toBe("QuickBooks is unavailable");
  });
});

describe("QuickBooks OAuth lifecycle", () => {
  it("does not exchange an invalid intent", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const claim = vi.fn().mockResolvedValue(null);

    await expect(completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=secret-code&state=bad&realmId=realm-1`),
      actorId: "actor-1",
      selectedBreweryId: "brewery-1",
      redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, fetch),
      store: { claim, complete: vi.fn(), fail: vi.fn() },
    })).rejects.toThrow("oauth state invalid");

    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks a claimed one-time exchange for recovery after a lost response", async () => {
    const fail = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("socket closed"));

    await expect(completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=one-time-code&state=opaque&realmId=realm-1`),
      actorId: "actor-1",
      selectedBreweryId: "brewery-1",
      redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, fetch),
      store: {
        claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect" }),
        complete: vi.fn(),
        fail,
      },
    })).rejects.toThrow("QuickBooks is unavailable");

    expect(fail).toHaveBeenCalledWith("intent-1", "actor-1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
