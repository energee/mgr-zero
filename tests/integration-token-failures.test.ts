import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError, type Ctx } from "@/lib/commands/registry";
const { rpc, visible } = vi.hoisted(() => ({ rpc: vi.fn(), visible: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { advanceSquareCatalogSync, advanceSquareSalesSync, claimQboOAuth, claimSquareOAuth, disconnectQbo, disconnectSquare, readPortalQuoteTax, readVersionedIntegrationTokens, type SquareCatalogSyncStart, type SquareSalesSyncStart } from "@/lib/supabase/integration-tokens";

const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: visible };
const ctx: Ctx = { breweryId: crypto.randomUUID(), userId: crypto.randomUUID(), roles: ["admin"], customerId: crypto.randomUUID(), db: { from: () => query } as unknown as Ctx["db"] };
const catalog: SquareCatalogSyncStart = { actorId: ctx.userId, connectionId: crypto.randomUUID(), merchantId: "seller", credentialVersion: 1, catalogGeneration: 1, requestId: crypto.randomUUID() };
const sales: SquareSalesSyncStart = { ...catalog, startsAt: "2026-01-01", endsAt: "2026-01-02", locationsCaptured: true, locationIds: [], locationOffset: 0, cursor: null, pages: 0 };
function answer(data: unknown, error: unknown = null) {
  const response = { data, error };
  rpc.mockReturnValue(Object.assign(Promise.resolve(response), { maybeSingle: async () => response }));
}
beforeEach(() => {
  rpc.mockReset();
  visible.mockResolvedValue({ data: { id: catalog.connectionId }, error: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("integration token failure classification", () => {
  it.each([claimQboOAuth, claimSquareOAuth])("separates missing OAuth state from database failure", async (claim) => {
    answer(null);
    await expect(claim("state", ctx.userId, ctx.breweryId, "https://mgr.test/callback")).resolves.toBeNull();
    answer(null, { message: "private database detail" });
    await expect(claim("state", ctx.userId, ctx.breweryId, "https://mgr.test/callback")).rejects.toThrow("OAuth claim failed");
  });
  it("does not report token database outages or malformed responses as 404", async () => {
    answer(null, { code: "XX000" });
    await expect(readVersionedIntegrationTokens(ctx, "qbo")).rejects.not.toBeInstanceOf(CommandError);
    answer({ access_token: "secret" });
    await expect(readVersionedIntegrationTokens(ctx, "qbo")).rejects.toThrow("response was invalid");
    answer(null);
    await expect(readVersionedIntegrationTokens(ctx, "qbo")).rejects.toMatchObject({ status: 404 });
  });
  it("does not report a visible-connection database outage as permission denied", async () => {
    visible.mockResolvedValue({ data: null, error: { code: "XX000" } });
    await expect(readVersionedIntegrationTokens(ctx, "square")).rejects.not.toBeInstanceOf(CommandError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    () => advanceSquareCatalogSync(ctx, catalog, 2),
    () => advanceSquareSalesSync(ctx, sales, 2),
  ])("reserves conflict for a real sync generation mismatch", async (advance) => {
    answer(false);
    await expect(advance()).rejects.toMatchObject({ status: 409 });
    answer(null, { code: "XX000" });
    await expect(advance()).rejects.not.toBeInstanceOf(CommandError);
    answer(true);
    await expect(advance()).resolves.toMatchObject({ credentialVersion: 2 });
  });
  it("keeps tax absence distinct from database or response failures", async () => {
    answer(null);
    await expect(readPortalQuoteTax(ctx, "quote")).resolves.toBeNull();
    answer(null, { code: "XX000" });
    await expect(readPortalQuoteTax(ctx, "quote")).rejects.toThrow("lookup failed");
    answer({ access_token: "secret" });
    await expect(readPortalQuoteTax(ctx, "quote")).rejects.toThrow("response was invalid");
  });
  it.each(["qbo", "square"] as const)("logs a safe %s revoke failure while preserving unresolved status", async (provider) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = { disconnected: true, remoteRevocationState: "unresolved" };
    rpc.mockImplementation((name: string) => {
      const response = { data: name.startsWith("begin_") ? { access_token: "secret", refresh_token: "secret" } : result, error: null };
      return Object.assign(Promise.resolve(response), { maybeSingle: async () => response });
    });
    const revoke = async () => { throw new Error("secret private provider payload"); };
    const requestId = crypto.randomUUID();
    const operation = provider === "qbo" ? disconnectQbo : disconnectSquare;
    await expect(operation(ctx, catalog.connectionId, revoke, requestId)).resolves.toEqual(result);
    expect(log.mock.calls).toEqual([[`${provider}_disconnect_revoke_failed`, { connectionId: catalog.connectionId, requestId }]]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    expect(rpc).toHaveBeenLastCalledWith(`finish_${provider}_disconnect`, expect.objectContaining({ p_revoked: false }));
  });
});
