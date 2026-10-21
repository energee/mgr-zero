// tests/retention-prune-route.test.ts — the retention wake also reaps stale
// QuickBooks OAuth exchanges (#1034). Without QuickBooks setup, a revoke must
// fail as a rejected promise (logged by the reap), not abort the job.
import { afterEach, expect, it, vi } from "vitest";

const reaped = vi.hoisted(() => ({ outcome: "" }));
vi.mock("@/lib/retention/jobs", () => ({ pruneCommandRequests: async () => 3 }));
vi.mock("@/lib/supabase/integration-tokens", () => ({
  reapQboOAuthExchanges: async (revoke: (refreshToken: string) => Promise<void>) => {
    reaped.outcome = await revoke("held-refresh").then(() => "revoked", () => "rejected");
    return 1;
  },
}));
import { POST } from "@/app/api/retention/jobs/prune/route";

afterEach(() => { vi.unstubAllEnvs(); });

it("prunes, then reaps with a revoke that rejects when QuickBooks is not configured", async () => {
  vi.stubEnv("RETENTION_JOB_SECRET", "retention");
  vi.stubEnv("QBO_CLIENT_ID", "");
  const response = await POST(new Request("https://mgr.test/job", { method: "POST", headers: { authorization: "Bearer retention" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, pruned: 3, reapedQboExchanges: 1 });
  expect(reaped.outcome).toBe("rejected");
});
