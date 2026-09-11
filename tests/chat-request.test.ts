import { describe, expect, it } from "vitest";
import { parseChatRequest, readChatRequest } from "@/lib/chat/request";

const id = "00000000-0000-4000-8000-000000000001";

describe("chat request boundary", () => {
  it("accepts one bounded user text message with explicit scope", () => {
    expect(parseChatRequest({ id, breweryId: id, message: { id, role: "user", parts: [{ type: "text", text: "What needs attention?" }] } })).toMatchObject({
      id, breweryId: id, text: "What needs attention?",
    });
  });

  it.each([
    [{ id, breweryId: id, messages: [] }],
    [{ id, breweryId: id, message: { id, role: "assistant", parts: [{ type: "text", text: "no" }] } }],
    [{ id, breweryId: id, message: { id, role: "user", parts: [{ type: "text", text: "x".repeat(4001) }] } }],
  ])("rejects client history, non-user roles and oversized input", (body) => {
    expect(() => parseChatRequest(body)).toThrow();
  });

  it("rejects an oversized HTTP body before JSON parsing", async () => {
    const request = new Request("http://localhost/api/chat", { method: "POST", body: " ".repeat(24 * 1024 + 1) });
    await expect(readChatRequest(request)).rejects.toMatchObject({ status: 413 });
  });
});
