import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { runOrderEmailBatch } from "@/lib/email/jobs";

const delivery = { id: crypto.randomUUID(), lease_token: crypto.randomUUID(), lease_expires_at: new Date(Date.now() + 600_000).toISOString(), retry_before: new Date(Date.now() + 82_800_000).toISOString(), payload: { from: "MGR <orders@example.test>", to: "buyer@example.test", subject: "Order confirmed", text: "Confirmed" } };
beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ORDER_EMAIL_FROM", "MGR <orders@example.test>");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("order email job", () => {
  it("records provider acceptance against only its opaque lease", async () => {
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "provider-id" })));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 1, retry: 0, blocked: 0 });
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", { p_delivery: delivery.id, p_lease: delivery.lease_token, p_provider_id: "provider-id", p_error: null, p_retry: false });
  });
  it("records a retry after uncertain transport without regenerating the message", async () => {
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("lost")));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 0, retry: 1, blocked: 0 });
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", expect.objectContaining({ p_delivery: delivery.id, p_provider_id: null, p_retry: true, p_error: "provider_uncertain" }));
  });
  it("does not classify a failed acceptance commit as a provider rejection", async () => {
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "provider-id" })));
    await expect(runOrderEmailBatch()).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("never sends after the saved provider retry window, even when a worker resumes late", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...delivery, retry_before: new Date(Date.now() - 1).toISOString() }], error: null }).mockResolvedValueOnce({ data: true, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 0, retry: 0, blocked: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", expect.objectContaining({ p_retry: false, p_error: "retry_window_expired" }));
  });
  it("fails closed before leasing when provider configuration is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(runOrderEmailBatch()).rejects.toThrow("RESEND_API_KEY");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("email job admission", () => {
  it("requires its own configured bearer secret before touching the outbox", async () => {
    const { POST } = await import("@/app/api/email/jobs/deliver/route");
    vi.stubEnv("CHAT_JOB_SECRET", "chat-only");
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "");
    expect((await POST(new Request("https://mgr.test/api/email/jobs/deliver", { method: "POST", headers: { authorization: "Bearer chat-only" } }))).status).toBe(401);
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "email-only");
    expect((await POST(new Request("https://mgr.test/api/email/jobs/deliver", { method: "POST", headers: { authorization: "Bearer chat-only" } }))).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await POST(new Request("https://mgr.test/api/email/jobs/deliver", { method: "POST", headers: { authorization: "Bearer email-only" } }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
