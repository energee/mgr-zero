// tests/work-filter-accessibility.test.ts — #727: every Work filter tab's
// aria-controls names a mounted, labelled tabpanel, in both the inventory
// record and the live WorkList adapter (one shared WorkView). Ported from #743.
// The explorer's guard on the filter tablist is asserted in shell-view.test.ts.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkList } from "../app/(app)/work/work-list";
import { TabBar } from "../components/mgr/qty";
import { WorkView } from "../components/mgr/views/work";
import { workWarehouse } from "../lib/mgr/fixtures/work";
import { toWorkViewProps } from "../lib/mgr/work-view";
import type { WorkRow } from "../lib/commands/landings";

const render = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const attr = (tag: string | undefined, name: string) => tag?.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
const isHidden = (tag: string) => /\shidden(?:=|\s|>)/.test(tag);

/** The tabs (open tag plus text), the panels (open tag plus body up to the next
 *  panel), and the one shown panel, after checking every tab controls a panel. */
function expectTabsToControlPanels(html: string) {
  const tabs = [...html.matchAll(/(<button\b[^>]*role="tab"[^>]*>)(.*?)<\/button>/g)].map(([, tag, text]) => ({ tag, text }));
  const panels = [...html.matchAll(/(<div\b[^>]*role="tabpanel"[^>]*>)(.*?)(?=<div\b[^>]*role="tabpanel"|$)/g)].map(([, tag, body]) => ({ tag, body }));
  expect(tabs.length).toBeGreaterThan(0);
  expect(panels).toHaveLength(tabs.length);
  expect(html).toMatch(/role="tablist"[^>]*aria-label="Filter work"|aria-label="Filter work"[^>]*role="tablist"/);
  for (const tab of tabs) {
    const panel = panels.find((p) => attr(p.tag, "id") === attr(tab.tag, "aria-controls"));
    expect(panel, `panel for ${tab.text}`).toBeTruthy();
    expect(attr(panel?.tag, "aria-labelledby")).toBe(attr(tab.tag, "id"));
    // The rows hold focusable actions, so the panel itself is not a Tab stop.
    expect(attr(panel?.tag, "tabindex")).toBe("-1");
  }
  const selected = tabs.find((tab) => tab.tag.includes('aria-selected="true"'));
  const shown = panels.filter((p) => !isHidden(p.tag));
  expect(shown).toHaveLength(1);
  expect(attr(shown[0].tag, "id")).toBe(attr(selected?.tag, "aria-controls"));
  return { selected: selected?.text, shown: shown[0].body };
}

describe("Work filter tab accessibility (#727)", () => {
  it("associates every inventory tab with its result panel", () => {
    const html = render(createElement(WorkView, { model: toWorkViewProps(workWarehouse) }));
    const { selected, shown } = expectTabsToControlPanels(html);
    expect(selected).toBe("all");
    expect(shown).toContain("ORD-0231 · Ridgeline");
  });

  it("keeps the live WorkList on the same panel-backed WorkView", () => {
    const rows: WorkRow[] = [
      { id: "order-1", kind: "orders", label: "ORD-LIVE-1", detail: "submitted", href: "/orders/1", verb: "Confirm", tone: "success", dueAt: null },
      { id: "route-1", kind: "routes", label: "Route-LIVE-1", detail: "3 stops", href: "/routes/1", verb: "Resume", tone: "info", dueAt: null },
    ];
    const html = render(createElement(WorkList, { rows, defaults: ["orders", "routes"], subtitle: "warehouse default", createAction: null, chips: ["all", "orders", "transfers", "batches", "runs", "POs", "routes"] }));
    const { shown } = expectTabsToControlPanels(html);
    expect(shown).toContain("ORD-LIVE-1");
    expect(shown).toContain("Route-LIVE-1");
  });

  it("shows the chosen chip's panel with only that kind's rows", () => {
    const html = render(createElement(WorkView, { model: toWorkViewProps(workWarehouse), chip: "routes" }));
    const { selected, shown } = expectTabsToControlPanels(html);
    expect(selected).toBe("routes");
    expect(shown).toContain("Route A");
    expect(shown).not.toContain("ORD-0231");
  });

  it("puts the empty state inside the shown panel", () => {
    const html = render(createElement(WorkView, { model: toWorkViewProps({ subtitle: "warehouse default", rows: [] }) }));
    expect(expectTabsToControlPanels(html).shown).toContain("Nothing in motion");
  });

  it("falls back to the first chip when the chosen one is not offered", () => {
    const html = render(createElement(WorkView, { model: toWorkViewProps(workWarehouse), chip: "bogus" }));
    const { selected, shown } = expectTabsToControlPanels(html);
    expect(selected).toBe("all");
    expect(shown).toContain("ORD-0231 · Ridgeline");
  });

  it("builds tab ids without whitespace, so a multi-word name still resolves", () => {
    const html = render(createElement(TabBar, { names: ["all", "Packaging runs"], on: 1, cls: "w-full", onChange: () => {}, label: "Filter work", panel: "rows" }));
    const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);
    for (const tab of tabs) expect(attr(tab, "aria-controls")).not.toMatch(/\s/);
    expect(expectTabsToControlPanels(html).selected).toBe("Packaging runs");
  });
});
