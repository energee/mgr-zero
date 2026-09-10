import { describe, expect, it, vi } from "vitest";
import { SquareClient, SQUARE_SCOPES, syncSquareCatalogFacts } from "@/lib/pos";

const config = {
  applicationId: "sandbox-app",
  applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth",
  environment: "sandbox" as const,
};

describe("Square provider boundary", () => {
  it("uses the server OAuth code flow and supported API revision", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-secret", refresh_token: "refresh-secret",
      expires_at: "2026-10-10T12:00:00Z", merchant_id: "merchant-1",
    }), { status: 200 }));
    const client = new SquareClient(config, fetch);
    const authorize = new URL(client.authorizeUrl("opaque-state"));

    expect(authorize.origin + authorize.pathname).toBe("https://connect.squareupsandbox.com/oauth2/authorize");
    expect(authorize.searchParams.get("scope")).toBe(SQUARE_SCOPES.join(" "));
    expect(authorize.searchParams.get("state")).toBe("opaque-state");
    expect(authorize.searchParams.has("code_challenge")).toBe(false);

    await expect(client.exchange("one-time-code")).resolves.toMatchObject({
      accessToken: "access-secret", refreshToken: "refresh-secret", merchantId: "merchant-1",
    });
    expect(fetch).toHaveBeenCalledWith("https://connect.squareupsandbox.com/oauth2/token", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Square-Version": "2026-08-19", "Content-Type": "application/json" }),
      body: JSON.stringify({
        client_id: config.applicationId, client_secret: config.applicationSecret,
        code: "one-time-code", grant_type: "authorization_code",
      }),
    }));
  });

  it("completes every catalog page before returning active and deleted variations", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ locations: [
        { id: "L1", name: "Taproom", status: "ACTIVE", merchant_id: "merchant-1" },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        objects: [{ type: "ITEM", id: "I1", version: 10, item_data: { name: "Hazy", variations: [
          { type: "ITEM_VARIATION", id: "V16", version: 11, item_variation_data: { item_id: "I1", name: "Pint" } },
        ] } }], cursor: "next-page",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        objects: [{ type: "ITEM_VARIATION", id: "V8", version: 12, is_deleted: true,
          item_variation_data: { item_id: "I1", name: "Half pint" } }],
      }), { status: 200 }));

    const facts = await syncSquareCatalogFacts(new SquareClient(config, fetch), "access-secret", "merchant-1");

    expect(facts.locations).toEqual([{ id: "L1", name: "Taproom", status: "ACTIVE" }]);
    expect(facts.variations).toEqual([
      { itemId: "I1", itemName: "Hazy", variationId: "V16", variationName: "Pint", version: 11, available: true },
      { itemId: "I1", itemName: "Hazy", variationId: "V8", variationName: "Half pint", version: 12, available: false },
    ]);
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
      object_types: ["ITEM", "ITEM_VARIATION"], include_deleted_objects: true,
    });
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toMatchObject({ cursor: "next-page" });
  });

  it("rejects a location from another merchant and revokes the full authorization honestly", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ locations: [
        { id: "L1", name: "Foreign", status: "ACTIVE", merchant_id: "merchant-2" },
      ] }), { status: 200 }));
    const client = new SquareClient(config, fetch);
    await expect(syncSquareCatalogFacts(client, "access-secret", "merchant-1")).rejects.toThrow("Square is unavailable");

    fetch.mockReset();
    fetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await client.revoke("access-secret");
    expect(fetch).toHaveBeenCalledWith("https://connect.squareupsandbox.com/oauth2/revoke", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Client sandbox-secret" }),
      body: JSON.stringify({ client_id: "sandbox-app", access_token: "access-secret", revoke_only_access_token: false }),
    }));
  });
});
