// Shared live/explorer conversation surface and its interaction affordances.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposerConversationView } from "@/components/mgr/views/composer-conversation";
import { ComposerStripView, isSendKey } from "@/components/mgr/views/composer-strip";
import { ComposerUnavailableView } from "@/components/mgr/composer-load-boundary";
import { OfflineOutboxView } from "@/components/mgr/views/composer";
import { COMPOSER_SETUP_TIMEOUT_MESSAGE, COMPOSER_SETUP_TIMEOUT_MS, loadComposerSetup } from "@/lib/composer/setup";
import { MAX_HISTORY_MESSAGES } from "@/lib/chat/model-messages";

describe("composer conversation surface", () => {
  it("renders a transcript, activity, recovery and conversation controls", () => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, {
      messages: [
        { id: "user", role: "user", content: "What needs attention?" },
        { id: "assistant", role: "assistant", content: "Two orders need review." },
      ],
      activity: "Checking orders…",
      error: "The response stopped.",
      onRetry: () => undefined,
    }));
    for (const text of ["What needs attention?", "Two orders need review.", "Checking orders…", "New chat", "Try again"]) expect(html).toContain(text);
    expect(html).toContain('role="log"');
  });

  it.each([
    "![stock](https://images.example.invalid/pixel?brewery=private)",
    '<img src="https://images.example.invalid/pixel?brewery=private" alt="stock" />',
    "[stock]: https://images.example.invalid/pixel?brewery=private\n\n![stock]",
  ])("does not load images supplied by an assistant reply: %s", (image) => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, {
      messages: [{ id: "assistant", role: "assistant", content: `**Stock remains private.**\n\n${image}` }],
    }));
    expect(html).not.toMatch(/<img\b|rel="preload"[^>]*as="image"/);
    expect(html).not.toContain("https://images.example.invalid");
    expect(html).toContain("Stock remains private.");
  });

  it("renders assistant markdown while keeping unsupported math literal (#934)", () => {
    const html = renderToStaticMarkup(createElement(ComposerConversationView, {
      messages: [{ id: "assistant", role: "assistant", content: "**Gravity** is $x^2$." }],
    }));
    expect(html).toContain('data-streamdown="strong">Gravity</span>');
    expect(html).toContain("$x^2$");
    expect(html).not.toContain('class="katex"');
  });

  it("supports stopping a stream and documents the input keyboard behavior", () => {
    const html = renderToStaticMarkup(createElement(ComposerStripView, { value: "hello", onChange: () => undefined, streaming: true, onStop: () => undefined }));
    expect(html).toContain("Stop response");
    expect(html).toContain('maxLength="4000"');
    expect(html).toContain("Shift + Enter");
  });

  it("sends on Enter, but not on Shift+Enter or while an IME is composing (#446)", () => {
    expect(isSendKey({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: false } })).toBe(true);
    expect(isSendKey({ key: "Enter", shiftKey: true, nativeEvent: { isComposing: false } })).toBe(false);
    expect(isSendKey({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: true } })).toBe(false);
    expect(isSendKey({ key: "a", shiftKey: false, nativeEvent: { isComposing: false } })).toBe(false);
  });

  it.each([false, true])("keeps outbox access available while chat is unavailable (failed=%s)", (failed) => {
    const view = ComposerUnavailableView({
      failed, outboxCount: 1, onOutbox: () => undefined,
      children: createElement(OfflineOutboxView, {
        rows: [{ id: "reading", label: "Tank 2 · saved reading", status: "queued", retryable: true }],
      }),
    });
    const html = renderToStaticMarkup(view);
    expect(html).toContain("Tank 2 · saved reading");
    expect(html).toContain("Retry exact reading");
    expect(html).toContain("Discard");
    expect(html).toMatch(/<button(?![^>]*\sdisabled(?:\s|=|>))[^>]*>Outbox \(1\)<\/button>/);
    expect(html).toMatch(/<textarea[^>]*\sdisabled=""/);
    if (failed) {
      expect(html).toContain('role="alert"');
      expect(html).toContain("Reload page");
    } else {
      expect(html).toContain('role="status"');
      expect(html).not.toContain("Reload page");
    }
  });
});


it("shows progress while setup is pending and offers setup recovery before a conversation exists (#1105)", () => {
  const html = renderToStaticMarkup(createElement(ComposerConversationView, {
    messages: [], activity: "Opening your conversation…", onSetupRetry: () => undefined,
  }));
  expect(html).toContain("Opening your conversation");
  expect(html).toContain('data-slot="skeleton"');
  expect(html).toContain("Retry setup");
});

it("shows progress while the chat interface itself loads (#1105)", () => {
  const html = renderToStaticMarkup(ComposerUnavailableView({ outboxCount: 0, onOutbox: () => undefined, children: null }));
  expect(html).toContain('data-slot="skeleton"');
});

describe("composer setup load (#1105)", () => {
  type Call = { name: string; input?: unknown; requestId?: string; signal: AbortSignal };
  type Run = (name: string, input: unknown, requestId: string | undefined, signal: AbortSignal) => Promise<unknown>;
  const fake = (answers: Record<string, unknown>, calls: Call[] = []): Run =>
    async (name, input, requestId, signal) => {
      calls.push({ name, input, requestId, signal });
      return answers[name];
    };
  const hang = (calls: Call[] = []): Run => (name, _input, requestId, signal) => {
    calls.push({ name, requestId, signal });
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  };
  // AbortSignal.timeout ignores fake timers, so the test owns the timeout signal.
  const clock = () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    return { timeout, expire: () => controller.abort(new DOMException("signal timed out", "TimeoutError")) };
  };
  afterEach(() => { vi.restoreAllMocks(); });

  it("restores the latest conversation's newest text turns, bounded by the setup timeout", async () => {
    const calls: Call[] = [];
    const { timeout } = clock();
    const setup = await loadComposerSetup(fake({
      list_chat_conversations: [{ id: "latest" }, { id: "older" }],
      get_chat_history: { messages: [
        { id: "u", role: "user", content: "Hi" },
        { id: "b", role: "assistant", content: "Hello" },
      ] },
    }, calls), { current: undefined }, new AbortController().signal);
    expect(setup.conversationId).toBe("latest");
    expect(setup.messages.map((message) => [message.id, message.role])).toEqual([["u", "user"], ["b", "assistant"]]);
    expect(calls.map((call) => [call.name, call.input])).toEqual([
      ["list_chat_conversations", {}],
      ["get_chat_history", { conversationId: "latest", recentTurns: MAX_HISTORY_MESSAGES }],
    ]);
    expect(timeout).toHaveBeenCalledWith(COMPOSER_SETUP_TIMEOUT_MS);
  });

  it("a retry after a timed-out create reuses the same request id, so no second conversation results", async () => {
    const createRequest = { current: undefined as string | undefined };
    const first: Call[] = [];
    const { expire } = clock();
    const answers = { list_chat_conversations: [] };
    const timedOut = loadComposerSetup(async (name, input, requestId, signal) => name === "create_chat_conversation" ? hang(first)(name, input, requestId, signal) : fake(answers, first)(name, input, requestId, signal), createRequest, new AbortController().signal);
    await vi.waitFor(() => expect(first.map((call) => call.name)).toContain("create_chat_conversation"));
    expire();
    await expect(timedOut).rejects.toThrow(COMPOSER_SETUP_TIMEOUT_MESSAGE);
    const second: Call[] = [];
    clock();
    const setup = await loadComposerSetup(fake({ ...answers, create_chat_conversation: { id: "new" } }, second), createRequest, new AbortController().signal);
    expect(setup).toEqual({ conversationId: "new", messages: [] });
    const ids = [...first, ...second].filter((call) => call.name === "create_chat_conversation").map((call) => call.requestId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });

  it("an abort that command() reports as a malformed response is still the timeout", async () => {
    const { expire } = clock();
    const load = loadComposerSetup(async () => { expire(); throw new Error("malformed response (200)"); }, { current: undefined }, new AbortController().signal);
    await expect(load).rejects.toThrow(COMPOSER_SETUP_TIMEOUT_MESSAGE);
  });

  it("a superseded load stops its requests and does not report a timeout", async () => {
    clock();
    const replaced = new AbortController();
    const calls: Call[] = [];
    const load = loadComposerSetup(hang(calls), { current: undefined }, replaced.signal);
    replaced.abort();
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.map((call) => call.name)).toEqual(["list_chat_conversations"]);
  });

  it("keeps a server failure's own message", async () => {
    const fail = async () => { throw new Error("Chat is not enabled for this brewery"); };
    await expect(loadComposerSetup(fail, { current: undefined }, new AbortController().signal)).rejects.toThrow("Chat is not enabled for this brewery");
  });

  it("the staff guide states the live timeout", () => {
    expect(readFileSync("content/docs/staff-guide.mdx", "utf8")).toContain(`${COMPOSER_SETUP_TIMEOUT_MS / 1000} seconds`);
  });
});
