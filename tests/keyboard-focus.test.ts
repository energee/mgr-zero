// tests/keyboard-focus.test.ts — keyboard focus in the shared shell and forms
// (#1474). A form opened from state (Tap keg) has no Radix trigger to give
// focus back to, and a form with a trigger can be opened by another control (a
// fact in Recipe's sentence), so CommandForm remembers its opener; the shell's
// first Tab stop skips the sidebar. Focus itself is DOM behavior checked by eye
// (AGENTS.md step 4); this pins the logic and the markup.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { rememberOpener, returnToOpener } from "@/components/mgr/command-form";
import { AppShell, type AppShellProps } from "@/components/mgr/app-shell";
import { navFor, PORTAL_NAV, STAFF_NAV } from "@/lib/mgr/nav";

afterEach(() => vi.unstubAllGlobals());

describe("CommandForm focus return", () => {
  it("focuses the control that had focus when the form opened", () => {
    const opener = { focus: vi.fn(), isConnected: true };
    vi.stubGlobal("document", { activeElement: opener });
    const ref = { current: null };
    rememberOpener(ref);
    expect(returnToOpener(ref, false)).toBe(true);
    expect(opener.focus).toHaveBeenCalled();
    expect(ref.current).toBeNull();
  });

  it("keeps the opener and focus in the form when a resize swaps sheet for dialog", () => {
    const opener = { focus: vi.fn(), isConnected: true };
    vi.stubGlobal("document", { activeElement: opener });
    const ref = { current: null };
    rememberOpener(ref);
    expect(returnToOpener(ref, true)).toBe(true);
    vi.stubGlobal("document", { activeElement: { focus: vi.fn(), isConnected: true } });
    rememberOpener(ref);
    expect(opener.focus).not.toHaveBeenCalled();
    returnToOpener(ref, false);
    expect(opener.focus).toHaveBeenCalled();
  });

  it("says when there is no control to return to, so a form with a trigger leaves the return to that trigger", () => {
    // A fact that opened the sheet and left the page while it was open (its number was cleared).
    const gone = { focus: vi.fn(), isConnected: false };
    vi.stubGlobal("document", { activeElement: gone });
    const ref = { current: null };
    rememberOpener(ref);
    expect(returnToOpener(ref, false)).toBe(false);
    expect(gone.focus).not.toHaveBeenCalled();
    expect(ref.current).toBeNull();
    // A tap that focused nothing leaves the page body as the active element.
    const body = { focus: vi.fn(), isConnected: true };
    vi.stubGlobal("document", { activeElement: body, body });
    rememberOpener(ref);
    expect(returnToOpener(ref, false)).toBe(false);
    expect(body.focus).not.toHaveBeenCalled();
  });

  it("returns focus to the opener of a form with a trigger too, and stops Radix only when it did or there is no trigger", () => {
    const source = readFileSync("components/mgr/command-form.tsx", "utf8");
    expect(source).toMatch(/onCloseAutoFocus: \(event: Event\) => \{ if \(returnToOpener\(opener, open\) \|\| !trigger\) event\.preventDefault\(\); \}/);
    expect(source).not.toMatch(/returnFocus = trigger \?/);
  });

  it("applies to both the phone sheet and the desk dialog", () => {
    const source = readFileSync("components/mgr/command-form.tsx", "utf8");
    expect(source.match(/\{\.\.\.returnFocus\}/g)).toHaveLength(2);
  });
});

describe.each([
  ["staff", navFor(STAFF_NAV, ["admin"])],
  ["portal", PORTAL_NAV],
] as const)("%s shell landmarks and skip link", (_audience, items) => {
  const props: AppShellProps = { brand: "Demo Brewing", items, children: "body" };
  const html = renderToStaticMarkup(createElement(AppShell, props));

  it("is the first link, ahead of the sidebar", () => {
    expect(html).toContain(">Skip to main content</a>");
    expect(html.indexOf("<a")).toBe(html.indexOf('<a href="#main"'));
  });

  it("targets focusable page content after the header controls", () => {
    expect(html).toMatch(/<div[^>]*id="main"[^>]*tabindex="-1"[^>]*data-mgr-page-scroll=""/);
    expect(html.match(/id="main"/g)).toHaveLength(1);
    expect(html.indexOf('id="main"')).toBeGreaterThan(html.indexOf("</header>"));
  });

  it("exposes the header as a banner and the sidebar menu as primary navigation", () => {
    expect(html).toMatch(/<header[^>]*role="banner"/);
    const primaryNavigation = html.match(/<nav aria-label="Primary">[\s\S]*?<\/nav>/)?.[0];
    expect(primaryNavigation).toContain(`href="${items[0].href}"`);
    expect(primaryNavigation).toContain(items[0].label);
  });
});
