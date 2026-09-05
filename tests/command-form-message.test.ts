// tests/command-form-message.test.ts — the shared submit-feedback element
// every command form renders (docs/audits 2026-09-05, accessibility #1/#2):
// an error is a live `role="alert"`, a soft warning a polite `role="status"`,
// so screen readers announce what a sighted user sees after Save.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommandFormMessage } from "@/components/mgr/command-form";

describe("CommandFormMessage", () => {
  it("renders an error as role=alert", () => {
    const html = renderToStaticMarkup(createElement(CommandFormMessage, { error: "Save failed" }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Save failed");
    expect(html).toContain("text-destructive");
  });

  it("renders a warning as a polite status", () => {
    const html = renderToStaticMarkup(createElement(CommandFormMessage, { tone: "warning" }, "ATP negative for Pale Ale"));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("ATP negative for Pale Ale");
    expect(html).not.toContain('role="alert"');
  });

  it("renders nothing when there is no message", () => {
    expect(renderToStaticMarkup(createElement(CommandFormMessage, { error: null }))).toBe("");
  });
});
