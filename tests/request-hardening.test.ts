import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/command/route";
import { MAX_COMMAND_BODY_BYTES } from "@/lib/commands/request-limits";
import { readBoundedJson } from "@/lib/request-json";

function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  return { request: new Request("http://localhost/api/command", { method: "POST", headers: { "content-type": "application/json", ...headers }, body, duplex: "half" } as RequestInit), cancelled: () => cancelled };
}

describe("bounded command request bodies", () => {
  it("shares bounded JSON reading without changing the caller's limit", async () => {
    const request = new Request("http://localhost/test", { method: "POST", headers: { "content-type": "application/json" }, body: '{"ok":true}' });
    await expect(readBoundedJson(request, 11)).resolves.toEqual({ ok: true });
  });

  it("leaves room for a realistic 5,000-row CSV import envelope", () => {
    const body = JSON.stringify({ breweryId: crypto.randomUUID(), name: "import_csv", requestId: crypto.randomUUID(), input: {
      kind: "customers", rows: Array.from({ length: 5_000 }, (_, i) => ({ name: `Customer ${i}`, type: "retailer", state: "PA", paymentTerms: "net30" })),
    } });
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(MAX_COMMAND_BODY_BYTES);
  });

  it("accepts exactly the byte cap and still reports invalid JSON", async () => {
    const { request } = streamed([new Uint8Array(MAX_COMMAND_BODY_BYTES).fill(32)]);
    expect((await POST(request)).status).toBe(400);
  });

  it.each([
    ["missing length", {}],
    ["lying length", { "content-length": "1" }],
  ])("rejects an oversized multibyte stream during reading with %s", async (_label, headers) => {
    const prefix = new TextEncoder().encode("€".repeat(Math.floor(MAX_COMMAND_BODY_BYTES / 3)));
    const { request, cancelled } = streamed([prefix, new TextEncoder().encode("€€")], headers);
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(cancelled()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "request_too_large" }, correlationId: expect.any(String) });
  });

  it("rejects an oversized declared length before reading", async () => {
    const { request } = streamed([], { "content-length": String(MAX_COMMAND_BODY_BYTES + 1) });
    expect((await POST(request)).status).toBe(413);
  });

  it("keeps the stable 413 when stream cancellation rejects", async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) { sent = true; controller.enqueue(new Uint8Array(MAX_COMMAND_BODY_BYTES + 1)); }
      },
      cancel: () => Promise.reject(new Error("cancel failed")),
    });
    const request = new Request("http://localhost/api/command", { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "request_too_large" } });
  });
});

describe("JSON request origin and media type", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["https://other.test", "null", "https://mgr.test.evil.test", "https://mgr.test/path"])("rejects the supplied untrusted Origin %s before body parsing", async (origin) => {
    vi.stubEnv("APP_URL", "https://mgr.test");
    const response = await POST(new Request("https://mgr.test/api/command", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: "not json",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_origin" } });
  });

  it.each([undefined, "https://mgr.test"])("allows absent or matching Origin %s and JSON parameters", async (origin) => {
    vi.stubEnv("APP_URL", "https://mgr.test");
    const request = new Request("https://mgr.test/api/command", {
      method: "POST", headers: { "content-type": "application/json; charset=utf-8", ...(origin ? { origin } : {}) }, body: '{"ok":true}',
    });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({ ok: true });
  });

  it("accepts an Origin equal to the request's own origin when APP_URL is unset", async () => {
    vi.stubEnv("APP_URL", undefined);
    const request = new Request("http://localhost:3001/api/command", {
      method: "POST", headers: { origin: "http://localhost:3001", "content-type": "application/json" }, body: '{"ok":true}',
    });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({ ok: true });
  });

  it("rejects a foreign Origin when APP_URL is unset", async () => {
    vi.stubEnv("APP_URL", undefined);
    const response = await POST(new Request("http://localhost:3001/api/command", {
      method: "POST", headers: { origin: "https://attacker.invalid", "content-type": "application/json" }, body: "{}",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_origin" } });
  });

  it("accepts the configured APP_URL origin behind a host that differs from it", async () => {
    vi.stubEnv("APP_URL", "https://mgr.test");
    const request = new Request("http://10.0.0.5:3000/api/command", {
      method: "POST", headers: { origin: "https://mgr.test", "content-type": "application/json" }, body: '{"ok":true}',
    });
    await expect(readBoundedJson(request, 64)).resolves.toEqual({ ok: true });
  });

  it.each([null, "text/plain", "application/x-www-form-urlencoded", "application/jsonp"])("requires JSON Content-Type, not %s", async (contentType) => {
    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    const request = new Request("https://mgr.test/api/command", { method: "POST", headers, body: "{}" });
    const response = await POST(request);
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: { code: "unsupported_media_type" } });
  });
});
