// tests/work-filter-accessibility.test.ts — #727: every Work filter tab's
// aria-controls names a mounted, labelled tabpanel, in both the inventory
// record and the live WorkList adapter (one shared WorkView). Ported from #743.
import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkList } from "../app/(app)/work/work-list";
import { WorkView } from "../components/mgr/views/work";
import { workWarehouse } from "../lib/mgr/fixtures/work";
import { toWorkViewProps } from "../lib/mgr/work-view";
import type { WorkRow } from "../lib/commands/landings";

const render = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const attr = (tag: string | undefined, name: string) => tag?.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
const isHidden = (tag: string) => /\shidden(?:=|\s|>)/.test(tag);

function expectTabsToControlPanels(html: string) {
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);
  const panels = [...html.matchAll(/<div\b[^>]*role="tabpanel"[^>]*>/g)].map(([tag]) => tag);
  expect(tabs).toHaveLength(7);
  expect(panels).toHaveLength(7);
  expect(html).toMatch(/role="tablist"[^>]*aria-label="Filter work"|aria-label="Filter work"[^>]*role="tablist"/);
  for (const tab of tabs) {
    const panel = panels.find((p) => attr(p, "id") === attr(tab, "aria-controls"));
    expect(panel, `panel for ${attr(tab, "id")}`).toBeTruthy();
    expect(attr(panel, "aria-labelledby")).toBe(attr(tab, "id"));
  }
  const selected = tabs.find((tab) => tab.includes('aria-selected="true"'));
  const shown = panels.filter((p) => !isHidden(p));
  expect(shown).toHaveLength(1);
  expect(attr(shown[0], "id")).toBe(attr(selected, "aria-controls"));
}

describe("Work filter tab accessibility (#727)", () => {
  it("associates every inventory tab with its result panel", () => {
    const html = render(createElement(WorkView, { model: toWorkViewProps(workWarehouse) }));
    expectTabsToControlPanels(html);
    expect(html).toContain("ORD-0231 · Ridgeline");
  });

  it("keeps the live WorkList on the same panel-backed WorkView", () => {
    const rows: WorkRow[] = [
      { id: "order-1", kind: "orders", label: "ORD-LIVE-1", detail: "submitted", href: "/orders/1", verb: "Confirm", tone: "success", dueAt: null },
      { id: "route-1", kind: "routes", label: "Route-LIVE-1", detail: "3 stops", href: "/routes/1", verb: "Resume", tone: "info", dueAt: null },
    ];
    const html = render(createElement(WorkList, { rows, defaults: ["orders", "routes"], subtitle: "warehouse default", createAction: null, chips: ["all", "orders", "transfers", "batches", "runs", "POs", "routes"] }));
    expectTabsToControlPanels(html);
    expect(html).toContain("ORD-LIVE-1");
    expect(html).toContain("Route-LIVE-1");
  });

  it("the explorer skips only the filter tabs, so rows in the panel still open their screens", () => {
    // The rows now sit inside the Tabs (a panel needs the Tabs context), so a
    // bare [data-work-filter] guard would swallow every row tap in the explorer.
    expect(readFileSync("components/mgr/screen-explorer.tsx", "utf8")).toContain("[data-work-filter] [role=tablist]");
  });
});
