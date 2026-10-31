// tests/retention-prune-route.test.ts — the retention wake also reaps stale
// QuickBooks OAuth exchanges (#1034). Without QuickBooks setup the reap is
// skipped entirely, so nothing is discarded unrevoked; with it, the route
// reports partial reap failure as HTTP 500 so the scheduler can alert.
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const reap = vi.hoisted(() => vi.fn());
vi.mock("@/lib/retention/jobs", () => ({ pruneCommandRequests: async () => 3 }));
vi.mock("@/lib/qbo", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/qbo")>(), reapQboOAuthExchanges: reap }));
import { POST } from "@/app/api/retention/jobs/prune/route";

const prune = () => POST(new Request("https://mgr.test/job", { method: "POST", headers: { authorization: "Bearer retention" } }));

beforeEach(() => {
  reap.mockReset();
  vi.stubEnv("RETENTION_JOB_SECRET", "retention");
});
afterEach(() => { vi.unstubAllEnvs(); });

it("skips the reap when QuickBooks is not configured", async () => {
  vi.stubEnv("QBO_CLIENT_ID", "");
  const response = await prune();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, pruned: 3, qboReap: null });
  expect(reap).not.toHaveBeenCalled();
});

it.each([0, 1])("reports the reap's failed count %i with the matching job status", async (failed) => {
  vi.stubEnv("QBO_CLIENT_ID", "client-id");
  vi.stubEnv("QBO_CLIENT_SECRET", "client-secret");
  vi.stubEnv("QBO_REDIRECT_URI", "https://mgr.test/api/integrations/qbo/oauth");
  vi.stubEnv("QBO_API_BASE", "https://sandbox-quickbooks.api.intuit.com");
  reap.mockResolvedValue({ done: 2, failed });
  const response = await prune();
  expect(response.status).toBe(failed ? 500 : 200);
  expect(await response.json()).toEqual({ ok: failed === 0, pruned: 3, qboReap: { done: 2, failed } });
});
