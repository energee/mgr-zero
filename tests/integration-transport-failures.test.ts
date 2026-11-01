import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/qbo";
import type * as IntegrationTokens from "@/lib/supabase/integration-tokens";
const boundary = vi.hoisted(() => ({ tokens: vi.fn(), recordBill: vi.fn(), beginPublication: vi.fn(), leasePublication: vi.fn(), finishPublication: vi.fn(), readTax: vi.fn(), finishTax: vi.fn() }));
vi.mock("@/lib/supabase/integration-tokens", async (original) => ({
  ...await original<typeof IntegrationTokens>(),
  readVersionedIntegrationTokens: boundary.tokens, finishQboReceiptBill: boundary.recordBill,
  beginSquarePublication: boundary.beginPublication, leaseSquarePublication: boundary.leasePublication, finishSquarePublication: boundary.finishPublication,
  readPortalQuoteTax: boundary.readTax, finishPortalQuoteTax: boundary.finishTax,
}));
import { completeSquareOAuth, publishSquareCatalogItem, SquareClient, type SquarePublicationSource } from "@/lib/pos";
import { postReceiptBill, QboOAuthClient } from "@/lib/qbo";
import { quotePortalOrder } from "@/lib/commands/portal";

const squareConfig = { applicationId: "app", applicationSecret: "secret", redirectUri: "https://mgr.test/callback", environment: "sandbox" as const };
const qboConfig = { clientId: "app", clientSecret: "secret", redirectUri: "https://mgr.test/callback", apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com" };
const receiptId = crypto.randomUUID(), connectionId = crypto.randomUUID(), requestId = crypto.randomUUID();
const dbRpc = vi.fn();
const ctx: Ctx = { userId: crypto.randomUUID(), breweryId: crypto.randomUUID(), roles: ["admin"], db: { rpc: dbRpc } as unknown as Ctx["db"] };
const source: SquarePublicationSource = { brandId: "brand", brand: "Beer", locationId: "location", catalogGroup: "poured", ownership: "mgr", externalItemId: null, variations: [] };
beforeEach(() => {
  vi.clearAllMocks();
  dbRpc.mockResolvedValue({ data: { receiptId, status: "pending", providerRequestId: requestId, requestBody: "{}", realmId: "realm", connectionId, mayPost: true }, error: null });
  boundary.tokens.mockResolvedValue({ accessToken: "access", connectionId, accessExpiresAt: null });
  boundary.recordBill.mockResolvedValue({ status: "pushed", remoteId: "bill" });
  boundary.beginPublication.mockResolvedValue({ attemptId: "attempt", connectionId, credentialVersion: 1, status: "needs_snapshot", source });
  boundary.leasePublication.mockResolvedValue({ requestBody: null, accessToken: "access", accessExpiresAt: null });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("integration transport failure boundaries", () => {
  it("keeps unexpected preparation exceptions retryable instead of terminal provider rejection", async () => {
    const failure = new TypeError("unexpected local error");
    boundary.beginPublication.mockResolvedValue({ attemptId: "attempt", status: "needs_snapshot", source: { ...source, get variations() { throw failure; } } });
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "location", brandId: "brand" }, requestId, new SquareClient(squareConfig, vi.fn()), "publish_pos_item")).rejects.toBe(failure);
    expect(boundary.finishPublication).not.toHaveBeenCalled();
  });
  it("records an explicit unwritable publication as provider_invalid, not a missing Square item", async () => {
    await expect(publishSquareCatalogItem(ctx, { posLocationId: "location", brandId: "brand" }, requestId, new SquareClient(squareConfig, vi.fn()), "publish_pos_item")).rejects.toThrow("Square catalog data is not writable");
    expect(boundary.finishPublication).toHaveBeenCalledWith(ctx, "attempt", "provider_invalid", null);
  });
  it.each([false, true])("revokes the entire failed OAuth grant only after a safe cleanup reservation (blocked=%s)", async (blocked) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "issued-access", refresh_token: "issued-refresh", merchant_id: "seller", expires_at: "2030-01-01T00:00:00Z" }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    const fail = vi.fn(async (_intent: string, _actor: string, state: string) => { if (blocked && state === "pending") throw new Error("stored owner"); });
    await expect(completeSquareOAuth({ request: new Request("https://mgr.test/callback?code=code&state=state"), actorId: ctx.userId, selectedBreweryId: ctx.breweryId,
      redirectUri: squareConfig.redirectUri, client: new SquareClient(squareConfig, fetch), store: {
        claim: async () => ({ intentId: "intent", breweryId: ctx.breweryId, providerIntent: "connect", requestedScopes: [] }),
        complete: vi.fn(), fail,
      } })).rejects.toThrow("Square is unavailable");
    expect(fetch).toHaveBeenCalledTimes(blocked ? 2 : 3);
    if (!blocked) expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ client_id: "app", merchant_id: "seller" });
    expect(fail).toHaveBeenLastCalledWith("intent", ctx.userId, blocked ? "unresolved" : "confirmed", "seller");
  });
  it("keeps a pre-POST token failure as the original error without recording an uncertain Bill", async () => {
    const failure = new Error("token database unavailable");
    boundary.tokens.mockRejectedValue(failure);
    const fetch = vi.fn();
    await expect(postReceiptBill(ctx, receiptId, requestId, new QboOAuthClient(qboConfig, fetch))).rejects.toBe(failure);
    expect(fetch).not.toHaveBeenCalled();
    expect(boundary.recordBill).not.toHaveBeenCalled();
  });
  it.each([
    new Error("Bill reconciliation identity was ambiguous"),
    new TypeError("provider network failed"),
    new SyntaxError("provider returned malformed JSON"),
  ])("keeps an earlier Bill outcome uncertain when reconciliation fails: %s", async (failure) => {
    dbRpc.mockResolvedValue({ data: { receiptId, status: "pending", providerRequestId: requestId, requestBody: "{}",
      realmId: "realm", connectionId, mayPost: false }, error: null });
    const client = new QboOAuthClient(qboConfig, vi.fn());
    vi.spyOn(client, "findReceiptBill").mockRejectedValue(failure);
    const create = vi.spyOn(client, "createTransaction");
    await expect(postReceiptBill(ctx, receiptId, requestId, client)).rejects.toMatchObject({
      status: 409, code: "conflict",
    });
    expect(create).not.toHaveBeenCalled();
    expect(boundary.recordBill).not.toHaveBeenCalled();
  });
  it("preserves the uncertain transport answer when recording that failure also fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    boundary.recordBill.mockRejectedValue(new Error("private record failure"));
    const client = new QboOAuthClient(qboConfig, vi.fn().mockRejectedValue(new TypeError("private provider error")));
    await expect(postReceiptBill(ctx, receiptId, requestId, client)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Bill outcome is uncertain") });
    expect(log.mock.calls).toEqual([["qbo_receipt_bill_failure_record_failed", { receiptId, providerRequestId: requestId }]]);
  });
  it("does not overwrite provider success with an uncertain failure when its commit fails", async () => {
    const failure = new Error("acceptance commit failed");
    boundary.recordBill.mockRejectedValue(failure);
    const client = new QboOAuthClient(qboConfig, vi.fn());
    vi.spyOn(client, "createTransaction").mockResolvedValue({ ok: true, remoteId: "bill", response: { Id: "bill" } });
    await expect(postReceiptBill(ctx, receiptId, requestId, client)).rejects.toBe(failure);
    expect(boundary.recordBill).toHaveBeenCalledTimes(1);
    expect(boundary.recordBill).toHaveBeenCalledWith(ctx, expect.objectContaining({ remoteId: "bill", error: null }));
  });
  it("preserves a definitive provider rejection when its diagnostic commit fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    boundary.recordBill.mockRejectedValue(new Error("record unavailable"));
    const client = new QboOAuthClient(qboConfig, vi.fn());
    vi.spyOn(client, "createTransaction").mockResolvedValue({ ok: false, status: 400, definitive: true });
    await expect(postReceiptBill(ctx, receiptId, requestId, client)).rejects.toBeInstanceOf(CommandError);
    expect(boundary.recordBill).toHaveBeenCalledWith(ctx, expect.objectContaining({ definitiveRejection: true }));
  });
  it("surfaces a quote token database failure instead of returning a tax-pending domain answer", async () => {
    const failure = new Error("Portal quote tax lookup failed");
    dbRpc.mockResolvedValue({ data: { taxReady: true, quoteId: crypto.randomUUID(), taxStatus: "pending" }, error: null });
    boundary.readTax.mockRejectedValue(failure);
    const client = new QboOAuthClient(qboConfig, vi.fn());
    const calculate = vi.spyOn(client, "calculateSalesTax");
    await expect(quotePortalOrder({ ...ctx, roles: ["customer"], customerId: crypto.randomUUID() }, {
      shipToId: crypto.randomUUID(), lines: [{ skuId: crypto.randomUUID(), qty: 1 }],
    }, requestId, client)).rejects.toBe(failure);
    expect(calculate).not.toHaveBeenCalled();
  });
  it("surfaces a quote tax store failure instead of returning a tax-pending answer", async () => {
    const failure = new Error("quote tax reconciliation is unavailable");
    const quoteId = crypto.randomUUID();
    dbRpc.mockResolvedValue({ data: { taxReady: true, quoteId, taxStatus: "pending" }, error: null });
    boundary.readTax.mockResolvedValue({ connectionId, accessToken: "access", input: {} });
    boundary.finishTax.mockRejectedValue(failure);
    const client = new QboOAuthClient(qboConfig, vi.fn());
    vi.spyOn(client, "calculateSalesTax").mockResolvedValue(100);
    await expect(quotePortalOrder({ ...ctx, roles: ["customer"], customerId: crypto.randomUUID() }, {
      shipToId: crypto.randomUUID(), lines: [{ skuId: crypto.randomUUID(), qty: 1 }],
    }, requestId, client)).rejects.toBe(failure);
    expect(boundary.finishTax).toHaveBeenCalledWith(expect.anything(), quoteId, connectionId, 100);
  });
});
