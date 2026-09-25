// Shared live/explorer conversation surface and its interaction affordances.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ComposerConversationView, ComposerStripView, isSendKey } from "@/components/mgr/views/composer";

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
});


it("explains pending setup and offers setup recovery before a conversation exists", () => {
  const html = renderToStaticMarkup(createElement(ComposerConversationView, {
    messages: [], activity: "Opening your conversation…", onSetupRetry: () => undefined,
  }));
  expect(html).toContain("Opening your conversation");
  expect(html).toContain("Retry setup");
  const live = readFileSync("components/mgr/composer.tsx", "utf8");
  expect(live).toContain('onSetupRetry={!conversationId ? reloadSetup : undefined}');
});
