import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkList } from "../app/(app)/work/work-list";
import { WorkView } from "../components/mgr/views/work";
import { workWarehouse } from "../lib/mgr/fixtures/work";
import { toWorkViewProps } from "../lib/mgr/work-view";
import type { WorkRow } from "../lib/commands/landings";

const render = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

function expectTabsToControlPanels(html: string) {
  const tabs = [...html.matchAll(/<button\b[^>]*role="tab"[^>]*>/g)].map(([tag]) => tag);
  expect(tabs).toHaveLength(7);
  const panels = [...html.matchAll(/<div\b[^>]*role="tabpanel"[^>]*>/g)].map(([tag]) => tag);
  expect(panels).toHaveLength(7);

  for (const tab of tabs) {
    const tabId = tab.match(/\bid="([^"]+)"/)?.[1];
    const panelId = tab.match(/\baria-controls="([^"]+)"/)?.[1];
    expect(tabId).toBeTruthy();
    expect(panelId).toBeTruthy();
    const panel = panels.find((candidate) => candidate.includes(`id="${panelId}"`));
    expect(panel).toBeTruthy();
    expect(panel).toContain(`aria-labelledby="${tabId}"`);
  }

  const selectedTab = tabs.find((tab) => tab.includes('aria-selected="true"'));
  const selectedPanelId = selectedTab?.match(/\baria-controls="([^"]+)"/)?.[1];
  const selectedPanel = panels.find((panel) => panel.includes(`id="${selectedPanelId}"`));
  expect(selectedPanel).toBeTruthy();
  expect(selectedPanel).not.toMatch(/\shidden(?:=|\s|>)/);
  for (const panel of panels) {
    if (panel !== selectedPanel) expect(panel).toMatch(/\shidden(?:=|\s|>)/);
  }
}

describe("Work filter tab accessibility", () => {
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
    const html = render(createElement(WorkList, { rows, defaults: ["orders"], subtitle: "warehouse default", createAction: null, chips: ["all", "orders", "transfers", "batches", "runs", "POs", "routes"] }));
    expectTabsToControlPanels(html);
    expect(html).toContain("ORD-LIVE-1");
    expect(html).toContain("Route-LIVE-1");
  });
});
