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
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("order email job", () => {
  it.each([[401, "authentication", true], [403, "authentication", true], [429, "rate_limit", true], [503, "outage", true], [422, "rejected", false], [409, "concurrent_request", true], [409, "rejected", false]] as const)("logs sanitized provider category for HTTP %i without changing retry safety", async (status, category, retryable) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ name: category === "concurrent_request" ? "concurrent_idempotent_requests" : "private-name", message: "buyer@example.test test-key Confirmed" }, { status })));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 0, retry: retryable ? 1 : 0, blocked: retryable ? 0 : 1 });
    expect(log.mock.calls).toEqual([["Order email delivery failure", { stage: "send", category, providerStatus: status, deliveryId: delivery.id }]]);
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", expect.objectContaining({ p_error: retryable ? "provider_uncertain" : "provider_rejected" }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/buyer@|orders@|test-key|Confirmed|private-name/);
  });
  it.each(["network", "malformed_response"] as const)("logs %s as uncertain without leaking exception or payload", async category => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    vi.stubGlobal("fetch", category === "network" ? vi.fn().mockRejectedValue(new Error("buyer@example.test test-key Confirmed")) : vi.fn().mockResolvedValue(new Response("buyer@example.test test-key Confirmed", { status: 200 })));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 0, retry: 1, blocked: 0 });
    expect(log.mock.calls).toEqual([["Order email delivery failure", { stage: "send", category, ...(category === "malformed_response" ? { providerStatus: 200 } : {}), deliveryId: delivery.id }]]);
  });
  it.each([new DOMException("buyer@example.test test-key Confirmed", "AbortError"), new TypeError("buyer@example.test test-key Confirmed"), new SyntaxError("buyer@example.test test-key Confirmed")])("distinguishes interrupted provider bodies from invalid JSON (%s)", async failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    const response = Response.json({ id: "provider-id" });
    vi.spyOn(response, "json").mockRejectedValue(failure);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 0, retry: 1, blocked: 0 });
    expect(log.mock.calls).toEqual([["Order email delivery failure", { stage: "send", category: failure instanceof SyntaxError ? "malformed_response" : "network", providerStatus: 200, deliveryId: delivery.id }]]);
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", expect.objectContaining({ p_error: "provider_uncertain" }));
  });
  it.each(["lease", "record_result"] as const)("sanitizes rejected RPC promises at %s", async stage => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (stage === "record_result") {
      rpc.mockResolvedValueOnce({ data: [delivery], error: null });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "provider-id" })));
    }
    rpc.mockRejectedValueOnce(new Error("buyer@example.test test-key Confirmed"));
    await expect(runOrderEmailBatch()).rejects.toThrow();
    expect(log.mock.calls).toEqual([["Order email delivery failure", { stage, category: "database", ...(stage === "record_result" ? { deliveryId: delivery.id } : {}) }]]);
  });
  it.each(["configuration", "lease", "lease_payload", "record_result", "lease_lost"] as const)("logs safe worker evidence at %s and keeps a failed job response", async failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "email-only");
    if (failure === "configuration") vi.stubEnv("RESEND_API_KEY", "");
    else if (failure === "lease") rpc.mockResolvedValueOnce({ data: null, error: { message: "buyer@example.test test-key Confirmed" } });
    else if (failure === "lease_payload") rpc.mockResolvedValueOnce({ data: [{ ...delivery, id: "buyer@example.test" }], error: null });
    else {
      rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce(failure === "lease_lost" ? { data: false, error: null } : { data: null, error: { message: "buyer@example.test test-key Confirmed" } });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "provider-id" })));
    }
    const { POST } = await import("@/app/api/email/jobs/deliver/route");
    const response = await POST(new Request("https://mgr.test/api/email/jobs/deliver", { method: "POST", headers: { authorization: "Bearer email-only" } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false });
    expect(log.mock.calls).toEqual([["Order email delivery failure", {
      stage: failure === "configuration" ? "configuration" : failure === "lease" || failure === "lease_payload" ? "lease" : "record_result",
      category: failure === "configuration" ? "configuration" : failure === "lease_payload" ? "malformed_response" : failure === "lease_lost" ? "lease_lost" : "database",
      ...(failure === "record_result" || failure === "lease_lost" ? { deliveryId: delivery.id } : {}),
    }]]);
  });
  it("refuses an expired lease without sending or recording a new outcome", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: [{ ...delivery, lease_expires_at: new Date(Date.now() - 1).toISOString() }], error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(runOrderEmailBatch()).rejects.toThrow("Order email lease expired before send");
    expect(fetch).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([["Order email delivery failure", { stage: "send", category: "lease_expired", deliveryId: delivery.id }]]);
  });
  it("records provider acceptance against only its opaque lease", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "provider-id" })));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 1, retry: 0, blocked: 0 });
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", { p_delivery: delivery.id, p_lease: delivery.lease_token, p_provider_id: "provider-id", p_error: null });
    expect(log).not.toHaveBeenCalled();
  });
  it("records a retry after uncertain transport without regenerating the message", async () => {
    rpc.mockResolvedValueOnce({ data: [delivery], error: null }).mockResolvedValueOnce({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("lost")));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 0, retry: 1, blocked: 0 });
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", expect.objectContaining({ p_delivery: delivery.id, p_provider_id: null, p_error: "provider_uncertain" }));
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
    expect(rpc).toHaveBeenLastCalledWith("finish_order_email", expect.objectContaining({ p_error: "retry_window_expired" }));
  });
  it("leaves recipient judgement to the provider so one unusual address cannot stall the batch", async () => {
    const odd = { ...delivery, id: crypto.randomUUID(), payload: { ...delivery.payload, to: "o&k@brewer.test" } };
    rpc.mockResolvedValueOnce({ data: [odd, delivery], error: null }).mockResolvedValue({ data: true, error: null });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ id: "provider-id" })));
    await expect(runOrderEmailBatch()).resolves.toEqual({ accepted: 2, retry: 0, blocked: 0 });
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
    const call = async (token: string) => (await POST(new Request("https://mgr.test/api/email/jobs/deliver", { method: "POST", headers: { authorization: `Bearer ${token}` } }))).status;
    vi.stubEnv("CHAT_JOB_SECRET", "chat-only");
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "");
    expect(await call("chat-only")).toBe(401);
    vi.stubEnv("ORDER_EMAIL_JOB_SECRET", "email-only");
    expect(await call("chat-only")).toBe(401);
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await call("email-only")).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
