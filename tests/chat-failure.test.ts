// Provider-free proof of Ask MGR's HTTP/stream failure protocol and recovery UI.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposerConversationView } from "@/components/mgr/views/composer-conversation";
import { APICallError, createUIMessageStreamResponse, DefaultChatTransport, readUIMessageStream, RetryError, toUIMessageStream, type TextStreamPart, type ToolSet } from "ai";
import { CHAT_FAILURES, encodeChatFailure, readChatFailure, type ChatFailureCode } from "@/lib/chat/failure";
import { providerFailureCode } from "@/lib/chat/provider-failure";
import { Chat } from "@ai-sdk/react";
import { BreweryProvider } from "@/lib/brewery-provider";
import ComposerConversation from "@/components/mgr/composer-conversation";

describe("Ask MGR failure recovery (#1294)", () => {
  it("does not offer retry when the failure has no recovery action", () => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, {
      messages: [], error: "Ask MGR is not configured. Contact your administrator.",
    }));
    expect(html).toContain("Contact your administrator");
    expect(html).not.toContain("Try again");
  });

  it.each([
    [401, "provider_access"], [402, "provider_access"], [403, "provider_access"],
    [404, "provider_access"], [429, "rate_limited"], [408, "unavailable"],
    [500, "unavailable"], [503, "unavailable"],
  ] as const)("classifies provider HTTP %s without exposing provider details", (statusCode, expected) => {
    const provider = new APICallError({ message: "private prompt / secret-token", url: "https://provider.invalid", requestBodyValues: {}, statusCode });
    expect(providerFailureCode(provider)).toBe(expected);
    const wrapped = new RetryError({ message: "retries exhausted", reason: "maxRetriesExceeded", errors: [provider] });
    expect(providerFailureCode(wrapped)).toBe(expected);
    expect(readChatFailure(new Error(encodeChatFailure(expected))).message).not.toContain("secret-token");
  });

  it("does not retry the known gateway billing denial even when wrapped in HTTP 500", () => {
    const error = Object.assign(new Error("Free tier users do not have access to this model"), { statusCode: 500 });
    expect(providerFailureCode(error)).toBe("provider_access");
    expect(readChatFailure(new Error(encodeChatFailure("provider_access"))).retryable).toBe(false);
  });

  it("keeps unknown provider details private and never guesses that retry is safe", () => {
    expect(providerFailureCode(new Error("unknown secret-token"))).toBe("unknown");
    expect(readChatFailure(new Error("unknown secret-token"))).toMatchObject({ code: "unknown", retryable: false });
    expect(readChatFailure(new Error("unknown secret-token")).message).not.toContain("secret-token");
    expect(readChatFailure(new TypeError("Failed to fetch"))).toMatchObject({ code: "offline", retryable: true });
    expect(readChatFailure(new Error("anything"), false).code).toBe("offline");
  });

  it.each(Object.keys(CHAT_FAILURES) as ChatFailureCode[])("uses the real HTTP transport for pre-stream %s failures", async (code) => {
    const transport = new DefaultChatTransport({ fetch: async () => new Response(encodeChatFailure(code), { status: 503 }) });
    const failure = await transport.sendMessages({ trigger: "submit-message", chatId: "conversation", messageId: undefined, messages: [], abortSignal: undefined }).catch((error: unknown) => error);
    expect(readChatFailure(failure)).toMatchObject({ code, retryable: CHAT_FAILURES[code].retryable });
  });

  it.each([429, 503, 403])("carries HTTP-200 stream failure %s through the actual SDK protocol", async (statusCode) => {
    const provider = new APICallError({ message: "secret-token and private prompt", url: "https://provider.invalid", requestBodyValues: {}, statusCode });
    const source = new ReadableStream<TextStreamPart<ToolSet>>({ start(controller) {
      controller.enqueue({ type: "error", error: provider }); controller.close();
    } });
    const response = createUIMessageStreamResponse({ stream: toUIMessageStream({
      stream: source, onError: (error) => encodeChatFailure(providerFailureCode(error)),
    }) });
    expect(response.status).toBe(200);
    const transport = new DefaultChatTransport({ fetch: async () => response });
    const chunks = await transport.sendMessages({ trigger: "submit-message", chatId: "conversation", messageId: undefined, messages: [], abortSignal: undefined });
    let failure: unknown;
    for await (const message of readUIMessageStream({ stream: chunks, onError: (error) => { failure = error; } })) {
      expect(JSON.stringify(message)).not.toContain("secret-token");
    }
    const result = readChatFailure(failure);
    expect(result.code).toBe(providerFailureCode(provider));
    expect(result.retryable).toBe(statusCode !== 403);
    const html = renderToStaticMarkup(createElement(ComposerConversationView, { messages: [], error: result.message, onRetry: result.retryable ? () => undefined : undefined }));
    expect(html.includes("Try again")).toBe(result.retryable);
    expect(html).not.toContain("secret-token");
    expect(html).not.toContain("An error occurred.");
  });

  it("explains an unanswered historical turn instead of implying that it is queued", () => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, {
      messages: [{ id: "failed-turn", role: "user", content: "Check inventory" }],
    }));
    expect(html).toContain("No completed MGR response was saved");
    expect(html).toContain("Chat messages are not queued");
  });

  it("disables the actual live adapter before accepting prompts when AI is not configured", () => {
    const html = renderToStaticMarkup(createElement(BreweryProvider, { id: "brewery", actorId: "staff" },
      createElement(ComposerConversation, { chatConfigured: false, open: true, onOpenChange: () => undefined, focusRequest: 0, outboxCount: 0, onOutbox: () => undefined, children: null })));
    expect(html).toContain(CHAT_FAILURES.not_configured.message);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("Opening your conversation");
  });

  it("regenerates the same user turn successfully after a transient stream failure without a provider", async () => {
    const sent: string[] = [];
    const transport = new DefaultChatTransport({ fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      sent.push(body.messages.findLast((message: { role: string }) => message.role === "user").id);
      const events = sent.length === 1
        ? [{ type: "error", errorText: encodeChatFailure("unavailable") }]
        : [{ type: "start", messageId: "answer" }, { type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: "Recovered response" }, { type: "text-end", id: "text" }, { type: "finish" }];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      });
    } });
    const chat = new Chat({ transport, generateId: () => "same-user-turn" });
    await chat.sendMessage({ text: "What needs attention?" });
    expect(readChatFailure(chat.error)).toMatchObject({ code: "unavailable", retryable: true });
    chat.clearError();
    await chat.regenerate();
    expect(chat.error).toBeUndefined();
    expect(sent).toEqual(["same-user-turn", "same-user-turn"]);
    expect(chat.messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(chat.messages.at(-1)?.parts).toContainEqual({ type: "text", text: "Recovered response", state: "done" });
  });
});
