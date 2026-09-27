import { beforeEach, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/commands/registry";
const boundary = vi.hoisted(() => ({ beginQboInvoiceSync: vi.fn(), completeQboInvoiceSync: vi.fn(), recordQboInvoiceSyncFailure: vi.fn(), readVersionedIntegrationTokens: vi.fn() }));
vi.mock("@/lib/supabase/integration-tokens", () => boundary);
import { syncQboInvoices, QboOAuthClient } from "@/lib/qbo";
const ctx = { role: "sales", userId: "actor", breweryId: "brewery" } as Ctx;
const requestId = "request";
const client = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "https://example.test", apiBaseUrl: "https://example.test" });
beforeEach(() => {
  vi.resetAllMocks();
  boundary.beginQboInvoiceSync.mockResolvedValue({ actorId: "actor", connectionId: "connection", realmId: "realm", targets: [{ invoiceId: "invoice", remoteId: "remote", requestBody: "{}" }] });
  boundary.readVersionedIntegrationTokens.mockResolvedValue({ connectionId: "connection", accessToken: "token" });
});
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
  await expect(syncQboInvoices({ ...ctx, role: "warehouse" }, requestId, client)).rejects.toThrow("permission denied");
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
