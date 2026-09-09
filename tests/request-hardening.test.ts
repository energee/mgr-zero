import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/command/route";
import { MAX_COMMAND_BODY_BYTES } from "@/lib/commands/request-limits";

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
  return { request: new Request("http://localhost/api/command", { method: "POST", headers, body, duplex: "half" } as RequestInit), cancelled: () => cancelled };
}

describe("bounded command request bodies", () => {
  it("leaves room for a realistic 5,000-row CSV import envelope", () => {
    const body = JSON.stringify({ breweryId: crypto.randomUUID(), name: "import_csv", requestId: crypto.randomUUID(), input: {
      kind: "customers", rows: Array.from({ length: 5_000 }, (_, i) => ({ name: `Customer ${i}`, type: "retailer", state: "PA", paymentTerms: "Net 30" })),
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
    const request = new Request("http://localhost/api/command", { method: "POST", body, duplex: "half" } as RequestInit);
    const response = await POST(request);
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "request_too_large" } });
  });
});
