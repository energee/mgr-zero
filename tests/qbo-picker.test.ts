// The QuickBooks mapping picker's live read (#1515): queryItems pages the
// connected company's items, and listQboRecords returns active customers or
// items by name for a person to pick. Nothing is matched or preselected.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/commands/registry";
const boundary = vi.hoisted(() => ({
  getQboHealth: vi.fn(), readVersionedIntegrationTokens: vi.fn(), leaseQboTokenRefresh: vi.fn(),
  releaseQboTokenRefresh: vi.fn(), compareAndSwapQboTokens: vi.fn(), markQboAuthorizationFailed: vi.fn(),
}));
vi.mock("@/lib/supabase/integration-tokens", () => boundary);
import { listQboRecords, QboOAuthClient } from "@/lib/qbo";

const config = { clientId: "id", clientSecret: "secret", redirectUri: "https://example.test", apiBaseUrl: "https://example.test" };
const ctx = { roles: ["sales"], userId: "actor", breweryId: "brewery" } as Ctx;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const items = (rows: unknown[]) => json({ QueryResponse: rows.length ? { Item: rows } : {} });
const item = (n: number, overrides: Record<string, unknown> = {}) => ({ Id: String(n), Name: `Item ${n}`, FullyQualifiedName: `Item ${n}`, Type: "NonInventory", Active: true, ...overrides });
const customer = (id: string, name: string, active = true) => ({
  Id: id, SyncToken: "0", DisplayName: name, Active: active,
  MetaData: { LastUpdatedTime: "2026-10-01T12:00:00-07:00" },
});
const setup = (...responses: (Response | Error)[]) => {
  const transport = vi.fn<typeof globalThis.fetch>();
  for (const r of responses) {
    if (r instanceof Error) transport.mockRejectedValueOnce(r);
    else transport.mockResolvedValueOnce(r);
  }
  return { transport, client: new QboOAuthClient(config, transport) };
};

describe("queryItems", () => {
  it("pages active items and names each by its full name, leaving out categories", async () => {
    const { client, transport } = setup(
      items([...Array.from({ length: 999 }, (_, i) => item(i + 1)), item(1000, { Type: "Category" })]),
      items([item(1001, { Name: "Pils", FullyQualifiedName: "Beer:Pils" })]),
    );
    const result = await client.queryItems("realm", "token");
    expect(result).toHaveLength(1000);
    expect(result.at(-1)).toEqual({ id: "1001", name: "Beer:Pils" });
    expect(result.some(row => row.id === "1000")).toBe(false);
    const query = (call: number) => new URL(String(transport.mock.calls[call][0])).searchParams.get("query");
    expect(query(0)).toBe("SELECT * FROM Item WHERE Active = true STARTPOSITION 1 MAXRESULTS 1000");
    expect(query(1)).toBe("SELECT * FROM Item WHERE Active = true STARTPOSITION 1001 MAXRESULTS 1000");
  });

  it("rejects a malformed or failed read instead of returning part of the list", async () => {
    await expect(setup(items([{ Id: "1" }])).client.queryItems("realm", "token")).rejects.toThrow("QuickBooks item response was invalid");
    await expect(setup(json({}, 500)).client.queryItems("realm", "token")).rejects.toMatchObject({ status: 500 });
  });
});

describe("listQboRecords", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    boundary.getQboHealth.mockResolvedValue({ connected: true, connectionId: "connection", realmId: "realm" });
    boundary.readVersionedIntegrationTokens.mockResolvedValue({ connectionId: "connection", accessToken: "token", refreshToken: "refresh", credentialVersion: 1, accessExpiresAt: null, refreshExpiresAt: null, refreshHardExpiresAt: null });
  });

  it("lists active customers by name with no row chosen", async () => {
    const { client } = setup(json({ QueryResponse: { Customer: [customer("9", "Oak and Barrel"), customer("4", "Ale House"), customer("7", "Closed Bar", false)] } }));
    expect(await listQboRecords(ctx, "customer", client)).toEqual([{ id: "4", name: "Ale House" }, { id: "9", name: "Oak and Barrel" }]);
  });

  it("asks for a connection before reading QuickBooks", async () => {
    boundary.getQboHealth.mockResolvedValue({ connected: false, state: "disconnected" });
    const { client, transport } = setup();
    await expect(listQboRecords(ctx, "item", client)).rejects.toMatchObject({ message: "Connect QuickBooks before mapping records", status: 409 });
    expect(transport).not.toHaveBeenCalled();
  });

  it("refreshes once after a 401 and reads again", async () => {
    const { client } = setup(json({}, 401), items([item(5)]));
    vi.spyOn(client, "refresh").mockResolvedValue({ accessToken: "new", refreshToken: "next", receivedAt: "2026-10-28T00:00:00Z", accessExpiresIn: 3600, refreshExpiresIn: null, refreshHardExpiresIn: null, grantedScopes: null });
    boundary.leaseQboTokenRefresh.mockResolvedValue("leased");
    boundary.releaseQboTokenRefresh.mockResolvedValue(undefined);
    boundary.readVersionedIntegrationTokens
      .mockResolvedValueOnce({ connectionId: "connection", accessToken: "token", refreshToken: "refresh", credentialVersion: 1, accessExpiresAt: null, refreshExpiresAt: null, refreshHardExpiresAt: null })
      .mockResolvedValueOnce({ connectionId: "connection", accessToken: "new", refreshToken: "next", credentialVersion: 2, accessExpiresAt: null, refreshExpiresAt: null, refreshHardExpiresAt: null });
    expect(await listQboRecords(ctx, "item", client)).toEqual([{ id: "5", name: "Item 5" }]);
  });

  it("says only that QuickBooks is unavailable when the read fails", async () => {
    const { client } = setup(new Error("provider secret token"));
    await expect(listQboRecords(ctx, "customer", client)).rejects.toThrow(/^QuickBooks is unavailable$/);
  });
});
