import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/commands/registry";
const boundary = vi.hoisted(() => ({ beginQboInvoiceSync: vi.fn(), completeQboInvoiceSync: vi.fn(), recordQboInvoiceSyncFailure: vi.fn(), readVersionedIntegrationTokens: vi.fn() }));
vi.mock("@/lib/supabase/integration-tokens", () => boundary);
import { syncQboInvoices, QboOAuthClient } from "@/lib/qbo";
const ctx = { roles: ["sales"], userId: "actor", breweryId: "brewery" } as Ctx;
const requestId = "request";
const client = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "https://example.test", apiBaseUrl: "https://example.test" });
beforeEach(() => {
  vi.resetAllMocks();
  boundary.beginQboInvoiceSync.mockResolvedValue({ actorId: "actor", connectionId: "connection", realmId: "realm", targets: [{ invoiceId: "invoice", remoteId: "remote", requestBody: "{}" }] });
  boundary.readVersionedIntegrationTokens.mockResolvedValue({ connectionId: "connection", accessToken: "token" });
});
afterEach(() => vi.restoreAllMocks());
it("records a safe failure for the frozen request without applying a partial read", async () => {
  vi.spyOn(client, "readInvoice").mockRejectedValue(new Error("provider secret token"));
  await expect(syncQboInvoices(ctx, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
  expect(boundary.recordQboInvoiceSyncFailure).toHaveBeenCalledWith(ctx, requestId);
  expect(boundary.completeQboInvoiceSync).not.toHaveBeenCalled();
});
it("replays a completed batch without another provider read or failure record", async () => {
  const result = { synced: 2, paid: 1, voided: 0, deleted: 0, drifted: 0 };
  boundary.beginQboInvoiceSync.mockResolvedValue({ replayResult: result });
  expect(await syncQboInvoices(ctx, requestId, client)).toEqual(result);
  expect(boundary.readVersionedIntegrationTokens).not.toHaveBeenCalled();
  expect(boundary.recordQboInvoiceSyncFailure).not.toHaveBeenCalled();
});
it("refuses unauthorized operators before claiming a batch", async () => {
  await expect(syncQboInvoices({ ...ctx, roles: ["warehouse"] }, requestId, client)).rejects.toThrow("permission denied");
  expect(boundary.beginQboInvoiceSync).not.toHaveBeenCalled();
});

it("does not apply the first observation when a later provider read fails", async () => {
  boundary.beginQboInvoiceSync.mockResolvedValue({ actorId: "actor", connectionId: "connection", realmId: "realm", targets: [
    { invoiceId: "first", remoteId: "one", requestBody: "{}" },
    { invoiceId: "second", remoteId: "two", requestBody: "{}" },
  ] });
  vi.spyOn(client, "readInvoice").mockResolvedValueOnce({ ok: true, syncToken: "1", taxCents: 0,
    totalCents: 100, balanceCents: 0, cashCollectedCents: 100, paidAt: null, privateNote: "", content: {},
  }).mockRejectedValueOnce(new Error("provider unavailable"));
  await expect(syncQboInvoices(ctx, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
  expect(boundary.completeQboInvoiceSync).not.toHaveBeenCalled();
  expect(boundary.recordQboInvoiceSyncFailure).toHaveBeenCalledWith(ctx, requestId);
});

it("returns terminal superseded disposition without reconciling or reading the provider", async () => {
  boundary.beginQboInvoiceSync.mockResolvedValue({ replayResult: { superseded: true } });
  expect(await syncQboInvoices(ctx, requestId, client)).toEqual({ superseded: true });
  expect(boundary.completeQboInvoiceSync).not.toHaveBeenCalled();
  expect(boundary.readVersionedIntegrationTokens).not.toHaveBeenCalled();
});

it("keeps the original failure when its failure record cannot be saved", async () => {
  boundary.readVersionedIntegrationTokens.mockResolvedValue({ connectionId: "replaced", accessToken: "token" });
  boundary.recordQboInvoiceSyncFailure.mockRejectedValue(new Error("database unavailable"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(syncQboInvoices(ctx, requestId, client)).rejects.toMatchObject({ message: "QuickBooks connection changed", status: 409 });
});

it("records failure and stops before another invoice when the total read budget expires", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  boundary.beginQboInvoiceSync.mockResolvedValue({ actorId: "actor", connectionId: "connection", realmId: "realm", targets: [
    { invoiceId: "first", remoteId: "one", requestBody: "{}" },
    { invoiceId: "second", remoteId: "two", requestBody: "{}" },
  ] });
  const read = vi.spyOn(client, "readInvoice").mockImplementation(async () => {
    deadline.abort(new DOMException("sync timed out", "TimeoutError"));
    return { ok: true, syncToken: "1", taxCents: 0, totalCents: 100, balanceCents: 100,
      cashCollectedCents: 0, paidAt: null, privateNote: "", content: {} };
  });
  await expect(syncQboInvoices(ctx, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
  expect(read).toHaveBeenCalledTimes(1);
  expect(boundary.completeQboInvoiceSync).not.toHaveBeenCalled();
  expect(boundary.recordQboInvoiceSyncFailure).toHaveBeenCalledWith(ctx, requestId);
});

it("does not reconcile when the total budget expires during the final invoice read", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  vi.spyOn(client, "readInvoice").mockImplementation(async () => {
    deadline.abort();
    return { ok: true, syncToken: "1", taxCents: 0, totalCents: 100, balanceCents: 100,
      cashCollectedCents: 0, paidAt: null, privateNote: "", content: {} };
  });
  await expect(syncQboInvoices(ctx, requestId, client)).rejects.toThrow("QuickBooks is unavailable");
  expect(boundary.completeQboInvoiceSync).not.toHaveBeenCalled();
  expect(boundary.recordQboInvoiceSyncFailure).toHaveBeenCalledWith(ctx, requestId);
});

it("keeps a timed-out sync recoverable with the same frozen request", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => ms === 180_000 ? deadline.signal : new AbortController().signal);
  const transport = vi.fn<typeof fetch>().mockImplementationOnce((_input, init) => {
    const { promise, reject } = Promise.withResolvers<Response>();
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    queueMicrotask(() => deadline.abort(new DOMException("sync timed out", "TimeoutError")));
    return promise;
  });
  const retryClient = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "https://example.test", apiBaseUrl: "https://example.test" }, transport);
  await expect(syncQboInvoices(ctx, requestId, retryClient)).rejects.toThrow("QuickBooks is unavailable");
  expect(boundary.recordQboInvoiceSyncFailure).toHaveBeenCalledWith(ctx, requestId);
  expect(boundary.completeQboInvoiceSync).not.toHaveBeenCalled();

  vi.mocked(AbortSignal.timeout).mockImplementation(() => new AbortController().signal);
  transport.mockResolvedValue(Response.json({ Invoice: { Id: "remote", SyncToken: "1", TotalAmt: 1, Balance: 1 } }));
  const result = { synced: 1, paid: 0, voided: 0, deleted: 0, drifted: 0 };
  boundary.completeQboInvoiceSync.mockResolvedValue(result);
  await expect(syncQboInvoices(ctx, requestId, retryClient)).resolves.toEqual(result);
  boundary.beginQboInvoiceSync.mockResolvedValue({ replayResult: result });
  await expect(syncQboInvoices(ctx, requestId, retryClient)).resolves.toEqual(result);
  expect(transport).toHaveBeenCalledTimes(2);
});
