// Shared live/explorer conversation surface and its interaction affordances.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComposerConversationView } from "@/components/mgr/views/composer-conversation";
import { ComposerStripView, isSendKey } from "@/components/mgr/views/composer-strip";
import { ComposerUnavailableView } from "@/components/mgr/composer-load-boundary";
import { OfflineOutboxView } from "@/components/mgr/views/composer";
import { COMPOSER_SETUP_TIMEOUT_MESSAGE, loadComposerSetup } from "@/lib/composer/setup";

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
    expect(html).not.toContain("Minimize");
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

  it("draws no dead History button; the drawer handle opens the conversation (#446)", () => {
    const html = renderToStaticMarkup(createElement(ComposerStripView, { value: "", onChange: () => undefined }));
    expect(html).not.toContain(">History<");
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
  type Call = { name: string; requestId?: string; signal: AbortSignal };
  const fake = (answers: Record<string, unknown>, calls: Call[] = []) =>
    async (name: string, _input: unknown, requestId: string | undefined, signal: AbortSignal) => {
      calls.push({ name, requestId, signal });
      return answers[name];
    };

  it("restores the latest conversation's text turns, bounded by the caller's signal", async () => {
    const calls: Call[] = [];
    const signal = new AbortController().signal;
    const setup = await loadComposerSetup(fake({
      list_chat_conversations: [{ id: "latest" }, { id: "older" }],
      get_chat_history: { messages: [
        { id: "u", role: "user", content: "Hi" },
        { id: "r", role: "result", content: "{}" },
        { id: "a", role: "assistant", content: null },
        { id: "b", role: "assistant", content: "Hello" },
      ] },
    }, calls), "create-request", signal);
    expect(setup.conversationId).toBe("latest");
    expect(setup.messages.map((message) => [message.id, message.role])).toEqual([["u", "user"], ["b", "assistant"]]);
    expect(calls.map((call) => call.name)).toEqual(["list_chat_conversations", "get_chat_history"]);
    expect(calls.every((call) => call.signal === signal)).toBe(true);
  });

  it("creates the first conversation with the caller's request id so a retry stays idempotent", async () => {
    const calls: Call[] = [];
    const setup = await loadComposerSetup(fake({ list_chat_conversations: [], create_chat_conversation: { id: "new" } }, calls), "create-request", new AbortController().signal);
    expect(setup).toEqual({ conversationId: "new", messages: [] });
    expect(calls.find((call) => call.name === "create_chat_conversation")?.requestId).toBe("create-request");
  });

  it("turns a timed-out load into the clear setup failure", async () => {
    const controller = new AbortController();
    const hang = (_name: string, _input: unknown, _requestId: string | undefined, signal: AbortSignal) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    const load = loadComposerSetup(hang, "create-request", controller.signal);
    controller.abort(new DOMException("signal timed out", "TimeoutError"));
    await expect(load).rejects.toThrow(COMPOSER_SETUP_TIMEOUT_MESSAGE);
  });

  it("keeps a server failure's own message", async () => {
    const fail = async () => { throw new Error("Chat is not enabled for this brewery"); };
    await expect(loadComposerSetup(fail, "create-request", new AbortController().signal)).rejects.toThrow("Chat is not enabled for this brewery");
  });
});
