// tests/sidebar-rail.test.ts — collapsing the desktop rail leaves an icon rail
// rather than sliding the whole sidebar off-canvas behind a zero-width wrapper
// (#305). The pixels are checked by eye (AGENTS.md step 4); this pins what the
// shell renders in each state.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { AppShell, type AppShellProps } from "@/components/mgr/app-shell";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";

const shell = (sidebarOpen: boolean) => {
  const props: AppShellProps = { brand: "Demo Brewing", items: navFor(STAFF_NAV, "admin"), sidebarOpen, children: "body" };
  return renderToStaticMarkup(createElement(AppShell, props));
};

describe("desktop rail", () => {
  it("collapses to icons, not off-canvas", () => {
    expect(shell(false)).toMatch(/data-collapsible="icon"/);
    expect(shell(false)).not.toMatch(/data-collapsible="offcanvas"/);
    expect(shell(true)).toMatch(/data-state="expanded"/);
  });

  it("keeps every tab in the collapsed rail and names it in a tooltip", () => {
    const html = shell(false);
    for (const tab of navFor(STAFF_NAV, "admin")) {
      // Once as the menu button's own label, once as its tooltip content.
      expect(html.split(`>${tab.label}<`).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("wraps the label so the collapsed width can hide it", () => {
    expect(shell(false)).toMatch(/<span>Today<\/span>/);
  });
});
