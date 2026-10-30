import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/commands/registry";
import type * as IntegrationTokens from "@/lib/supabase/integration-tokens";

const store = vi.hoisted(() => ({ read: vi.fn(), begin: vi.fn(), fail: vi.fn() }));
vi.mock("@/lib/supabase/integration-tokens", async (importOriginal) => ({
  ...await importOriginal<typeof IntegrationTokens>(),
  beginQboInvoiceSync: store.begin,
  readVersionedIntegrationTokens: store.read,
  recordQboInvoiceSyncFailure: store.fail,
  leaseQboTokenRefresh: async () => "leased",
  releaseQboTokenRefresh: async () => undefined,
  compareAndSwapQboTokens: async () => undefined,
}));

import { QboOAuthClient, syncQboInvoices } from "@/lib/qbo";

const credentials = {
  connectionId: "connection-1", credentialVersion: 1, accessToken: "access-secret", refreshToken: "refresh-secret",
  accessExpiresAt: null, refreshExpiresAt: null, refreshHardExpiresAt: null,
};
const ctx = { roles: ["admin"] } as Ctx;

describe("QuickBooks invoice sync failure diagnostics", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    store.begin.mockResolvedValue({
      actorId: "actor-1", connectionId: "connection-1", realmId: "realm-1",
      targets: [{ invoiceId: "invoice-1", remoteId: "remote-1" }],
    });
    store.read.mockResolvedValue(credentials);
    store.fail.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); });

  it.each([false, true])("logs the original read failure after refresh=%s", async (retry) => {
    const client = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "https://mgr.test/oauth", apiBaseUrl: "https://mgr.test" });
    const read = vi.spyOn(client, "readInvoice");
    if (retry) {
      read.mockResolvedValueOnce({ ok: false, status: 401, definitive: false });
      store.read.mockResolvedValueOnce(credentials).mockResolvedValue({ ...credentials, credentialVersion: 2 });
      vi.spyOn(client, "refresh").mockResolvedValue({
        accessToken: "next-access-secret", refreshToken: "next-refresh-secret", receivedAt: new Date().toISOString(),
        accessExpiresIn: 3600, refreshExpiresIn: null, refreshHardExpiresIn: null, grantedScopes: null,
      });
    }
    read.mockRejectedValueOnce(new TypeError("DNS access-secret refresh-secret"));
    await expect(syncQboInvoices(ctx, "request-1", client)).rejects.toThrow("QuickBooks is unavailable");
    expect(console.error).toHaveBeenCalledWith("qbo_unavailable", {
      name: "TypeError", status: null, stage: retry ? "invoice_sync_read_retry" : "invoice_sync_read",
    });
    expect(store.fail).toHaveBeenCalledWith(ctx, "request-1");
    expect(read).toHaveBeenCalledTimes(retry ? 2 : 1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });

  it("logs a non-definitive HTTP response before returning unavailable", async () => {
    const client = new QboOAuthClient({ clientId: "id", clientSecret: "secret", redirectUri: "https://mgr.test/oauth", apiBaseUrl: "https://mgr.test" });
    vi.spyOn(client, "readInvoice").mockResolvedValue({ ok: false, status: 503, definitive: false });
    await expect(syncQboInvoices(ctx, "request-1", client)).rejects.toThrow("QuickBooks is unavailable");
    expect(console.error).toHaveBeenCalledWith("qbo_unavailable", {
      name: "Error", status: 503, stage: "invoice_sync_read",
    });
  });
});
