import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailProviderError, sendOrderEmail } from "@/lib/email/transport";

const message = { from: "MGR <orders@example.test>", to: "buyer@example.test", subject: "Order 42 confirmed", text: "Your order is confirmed." };
afterEach(() => vi.unstubAllGlobals());

describe("buyer confirmation transport", () => {
  it("replays an identical provider key and body after a lost response", async () => {
    const accepted = new Map<string, string>();
    const calls: { key: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
      const key = new Headers(options.headers).get("idempotency-key")!;
      const body = String(options.body);
      calls.push({ key, body });
      if (!accepted.has(key)) { accepted.set(key, body); throw new TypeError("response lost"); }
      expect(accepted.get(key)).toBe(body);
      return Response.json({ id: "email-42" });
    }));
    await expect(sendOrderEmail("delivery-42", message, "test-key")).rejects.toThrow();
    await expect(sendOrderEmail("delivery-42", message, "test-key")).resolves.toBe("email-42");
    expect(accepted.size).toBe(1);
    expect(calls[0]).toEqual(calls[1]);
  });

  it("does not expose provider payloads in errors or accept missing provider identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ message: "private@example.test" }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ unexpected: "ok" })));
    await expect(sendOrderEmail("delivery-42", message, "test-key")).rejects.toThrow("Email provider rejected request (429)");
    await expect(sendOrderEmail("delivery-42", message, "test-key")).rejects.toThrow("Email provider response has no id");
  });

  it("retries our own configuration errors but not a rejected message", async () => {
    for (const [status, retryable] of [[401, true], [403, true], [422, false]] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ name: "error" }, { status })));
      const error = await sendOrderEmail("delivery-42", message, "test-key").catch((e: unknown) => e);
      expect(error, String(status)).toBeInstanceOf(EmailProviderError);
      expect((error as EmailProviderError).retryable, String(status)).toBe(retryable);
    }
  });
});
