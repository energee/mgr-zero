import { describe, expect, it, vi } from "vitest";
import { completeQboOAuth, QboOAuthClient, sanitizeQboError } from "@/lib/qbo";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
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
    vi.useFakeTimers();
    vi.setSystemTime("2026-09-09T18:00:00.000Z");
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600,
      x_refresh_token_expires_in: 8640000,
    }), { status: 200 }));
    try {
      const tokens = await new QboOAuthClient(config, fetch).refresh("old-refresh");
      expect(tokens).toMatchObject({
        refreshToken: "next-refresh", refreshHardExpiresIn: null, receivedAt: "2026-09-09T18:00:00.000Z",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("revokes with the maintained JSON contract and sanitizes provider failures", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    await new QboOAuthClient(config, fetch).revoke("refresh-secret");
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ token: "refresh-secret" }) });
    expect(sanitizeQboError(new Error("failed access-secret refresh-secret"))).toBe("QuickBooks is unavailable");
  });
});

describe("QuickBooks OAuth lifecycle", () => {
  it("falls back to the claimed scopes when the token response omits optional scope and refuses broader response scope", async () => {
    const requestedScopes = ["com.intuit.quickbooks.accounting", "indirect-tax.tax-calculation.quickbooks"];
    const complete = vi.fn().mockResolvedValue("connection-1");
    const fail = vi.fn().mockResolvedValue(undefined);
    const callback = (scope?: string) => completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=one-time-code&state=opaque&realmId=realm-1`),
      actorId: "actor-1", selectedBreweryId: "brewery-1", redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, vi.fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(new Response(JSON.stringify({
          access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
          ...(scope === undefined ? {} : { scope }),
        }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "1" } }), { status: 200 }))),
      store: {
        claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes }),
        complete, fail,
      },
    });

    await expect(callback()).resolves.toBe("connection-1");
    expect(complete).toHaveBeenLastCalledWith("intent-1", "actor-1", "realm-1",
      expect.objectContaining({ grantedScopes: requestedScopes }));

    await expect(callback("com.intuit.quickbooks.accounting")).resolves.toBe("connection-1");
    expect(complete).toHaveBeenLastCalledWith("intent-1", "actor-1", "realm-1",
      expect.objectContaining({ grantedScopes: ["com.intuit.quickbooks.accounting"] }));

    complete.mockClear();
    await expect(callback("com.intuit.quickbooks.accounting unrequested.scope")).rejects.toThrow("QuickBooks is unavailable");
    expect(complete).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith("intent-1", "actor-1");
  });

  it("accepts a realm-scoped CompanyInfo response whose entity Id differs from the realm", async () => {
    const complete = vi.fn().mockResolvedValue("connection-1");
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "1" } }), { status: 200 }));

    await expect(completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=one-time-code&state=opaque&realmId=9341452071117966`),
      actorId: "actor-1", selectedBreweryId: "brewery-1", redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, fetch),
      store: {
        claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: ["com.intuit.quickbooks.accounting"] }),
        complete, fail: vi.fn(),
      },
    })).resolves.toBe("connection-1");
    expect(String(fetch.mock.calls[1][0])).toBe("https://sandbox-quickbooks.api.intuit.com/v3/company/9341452071117966/companyinfo/9341452071117966?minorversion=75");
    expect(complete).toHaveBeenCalledWith("intent-1", "actor-1", "9341452071117966", expect.any(Object));
  });

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
        claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: ["com.intuit.quickbooks.accounting"] }),
        complete: vi.fn(),
        fail,
      },
    })).rejects.toThrow("QuickBooks is unavailable");

    expect(fail).toHaveBeenCalledWith("intent-1", "actor-1");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a malformed CompanyInfo response or a realm-scoped request denial", async () => {
    const complete = vi.fn();
    const fail = vi.fn().mockResolvedValue(undefined);
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-secret", refresh_token: "refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ CompanyInfo: { Id: "" } }), { status: 200 }));

    await expect(completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=one-time-code&state=opaque&realmId=known-victim-realm`),
      actorId: "actor-1", selectedBreweryId: "brewery-1", redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, fetch),
      store: {
        claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: ["com.intuit.quickbooks.accounting"] }),
        complete, fail,
      },
    })).rejects.toThrow("QuickBooks is unavailable");

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1];
    expect(String(url)).toBe("https://sandbox-quickbooks.api.intuit.com/v3/company/known-victim-realm/companyinfo/known-victim-realm?minorversion=75");
    expect(init).toMatchObject({ method: "GET", headers: { Authorization: "Bearer access-secret", Accept: "application/json" } });
    expect(complete).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith("intent-1", "actor-1");

    const deniedComplete = vi.fn();
    const deniedFail = vi.fn().mockResolvedValue(undefined);
    const deniedFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "denied-access-secret", refresh_token: "denied-refresh-secret", expires_in: 3600,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Fault: { Detail: "denied-access-secret" } }), { status: 403 }));
    await expect(completeQboOAuth({
      request: new Request(`${config.redirectUri}?code=denied-code&state=denied&realmId=denied-realm`),
      actorId: "actor-1", selectedBreweryId: "brewery-1", redirectUri: config.redirectUri,
      client: new QboOAuthClient(config, deniedFetch),
      store: {
        claim: vi.fn().mockResolvedValue({ intentId: "intent-2", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: ["com.intuit.quickbooks.accounting"] }),
        complete: deniedComplete, fail: deniedFail,
      },
    })).rejects.toThrow("QuickBooks is unavailable");
    expect(deniedComplete).not.toHaveBeenCalled();
    expect(deniedFail).toHaveBeenCalledWith("intent-2", "actor-1");
  });
});
