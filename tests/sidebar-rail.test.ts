// tests/sidebar-rail.test.ts — collapsing the desktop rail leaves an icon rail
// rather than sliding the whole sidebar off-canvas behind a zero-width wrapper
// (#305). Rendering is checked by eye; this pins the shell contract shadcn's
// icon mode needs to work at all.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("components/mgr/app-shell.tsx", "utf8");
const sidebar = readFileSync("components/ui/sidebar.tsx", "utf8");

describe("collapsed desktop rail", () => {
  it("collapses to icons, not off-canvas", () => {
    expect(shell).toMatch(/<Sidebar collapsible="icon"/);
    expect(shell).not.toMatch(/collapsible="offcanvas"/);
  });

  it("wraps every tab label in a span so icon mode can hide it", () => {
    expect(shell).toMatch(/\{tab\.icon && <Icon icon=\{tab\.icon\} \/>\}<span>\{tab\.label\}<\/span>/);
  });

  it("names each collapsed tab in a tooltip, the only label left at 48px", () => {
    expect(shell).toMatch(/<SidebarMenuButton asChild tooltip=\{tab\.label\}/);
  });

  it("relies on shadcn hiding sub-items and sizing the rail in icon mode", () => {
    expect(sidebar).toMatch(/group-data-\[collapsible=icon\]:hidden/);
    expect(sidebar).toMatch(/group-data-\[collapsible=icon\]:w-\(--sidebar-width-icon\)/);
  });
});
