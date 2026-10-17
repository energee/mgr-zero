// tests/kegs-view.test.ts — Keg fleet, Customer keg balance, and Keg event
// history. Views own no sample data. Live PoolForm / KegEventForm wrap the
// shared KegPoolFields / KegEventFields in their command forms.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { KegBalanceView } from "../components/mgr/views/keg-balance";
import { KegEventFields, KegFleetView } from "../components/mgr/views/keg-fleet";
import { KegHistoryView } from "../components/mgr/views/keg-history";
import { KEG_EVENT_REASONS } from "../lib/mgr/enums";
import { kegBalanceRidgeline, kegFleetMicrostar, kegHistoryLedger } from "../lib/mgr/fixtures/kegs";
import { toKegBalanceViewProps } from "../lib/mgr/keg-balance-view";
import { kegShortageText, toKegFleetViewProps } from "../lib/mgr/keg-fleet-view";
import { REASON_EFFECT, REASON_LABEL } from "../lib/mgr/keg-labels";
import { toKegHistoryViewProps } from "../lib/mgr/keg-history-view";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Keg fleet", () => {
  it("#815 prints each saved location shortage with its pool and size", () => {
    const shortages = [{ pool: "Owned", keg_size: "half_bbl", location: "Warehouse", short: 2 }];
    const model = toKegFleetViewProps({ ...kegFleetMicrostar, shortages: shortages.map(kegShortageText) });
    expect(model.shortages).toEqual(["Owned ½ bbl · Warehouse: 2 kegs short · record Acquired kegs to reconcile"]);
    expect(htmlOf(createElement(KegFleetView, { model }))).toContain(model.shortages![0]);
  });
  it("does not restore fixture controls when live slots are explicitly disabled", () => {
    const html = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps({ pools: [], navRows: [] }), eventForm: null }));
    expect(html).not.toContain("Record keg event");
    expect(html).not.toContain("Selected pool");
    expect(html).not.toContain("Customer keg balance");
    expect(html).not.toContain("Preview:");
  });
  it("the Keg fleet inventory record is KegFleetView", () => {
    const body = screen("Keg fleet").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Keg fleet").body)).toBe(true);
    expect(body.type).toBe(KegFleetView);
    expect(body.props.model).toEqual(toKegFleetViewProps(kegFleetMicrostar));
  });

  it("renders Record keg event without leaking live hrefs", () => {
    const html = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps(kegFleetMicrostar) }));
    expect(html).toMatch(/>Record keg event</);
    expect(html).toMatch(/Microstar/);
    expect(html).not.toMatch(/href="\/kegs/);
    expect(html).not.toMatch(/href="\/inventory"/);
  });

  it("#974 Reason is a labeled select stating the chosen reason's effect, for each of the six manual reasons", () => {
    expect(Object.keys(REASON_EFFECT)).toEqual([...KEG_EVENT_REASONS]);
    for (const reason of KEG_EVENT_REASONS) {
      const html = htmlOf(createElement(KegEventFields, { value: { ...kegFleetMicrostar.eventForm!, reason }, options: kegFleetMicrostar.eventOptions!, onChange: () => {} }));
      expect(html, reason).toMatch(/<label[^>]*for="keg-reason"[^>]*>Reason<\/label>/);
      const trigger = html.match(/<button[^>]*id="keg-reason"[^>]*>/)?.[0] ?? "";
      expect(trigger, reason).toContain('role="combobox"');
      expect(trigger, reason).toContain('aria-describedby="keg-reason-effect"');
      expect(html, reason).toContain(`>${REASON_LABEL[reason]}</span>`);
      expect(html.match(/<p[^>]*id="keg-reason-effect"[^>]*>(.*?)<\/p>/)?.[1], reason).toBe(REASON_EFFECT[reason]);
      expect(html, reason).not.toContain("toggle-group-item");
    }
  });

  it("#974 the inventory shows no balance preview, which live has no data for", () => {
    expect(htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps(kegFleetMicrostar) }))).not.toContain("Preview:");
  });

  it("the live kegs page mounts KegFleetView and slots PoolForm", () => {
    const page = src("app/(app)/kegs/page.tsx");
    expect(page).toMatch(/<KegFleetView\b/);
    expect(page).not.toMatch(/\blist=/);
    expect(page).not.toMatch(/\bnavs=/);
    expect(page).toMatch(/<PoolForm\b/);
    expect(page).toMatch(/<KegEventForm\b/);
    expect(page).not.toMatch(/\bnote=/);
    expect(src("components/mgr/views/keg-fleet.tsx").match(/Beer coming back with a keg/g)).toHaveLength(1);
  });
});

describe("Customer keg balance", () => {
  it("the Customer keg balance inventory record is KegBalanceView", () => {
    const body = screen("Customer keg balance").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(KegBalanceView);
    expect(body.props.model).toEqual(toKegBalanceViewProps(kegBalanceRidgeline));
  });

  it("maps live balance rows without inventing an overdue row", () => {
    const model = toKegBalanceViewProps({
      customer: "Ridgeline Tap Room",
      kegs: "2 kegs",
      deposits: "$60.00 deposits held",
      rows: [{ key: "p1-half_bbl", title: "Owned ½ bbl", detail: "2 out", trailing: "$60.00" }],
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.verb).toBeUndefined();
  });

  it("the live customer keg page mounts KegBalanceView", () => {
    const page = src("app/(app)/kegs/customers/[customerId]/page.tsx");
    expect(page).toMatch(/<KegBalanceView\b/);
  });
});

describe("Keg event history", () => {
  it("the Keg event history inventory record is KegHistoryView", () => {
    const body = screen("Keg event history").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(KegHistoryView);
    expect(body.props.model).toEqual(toKegHistoryViewProps(kegHistoryLedger));
  });

  it("the live history page mounts KegHistoryView", () => {
    const page = src("app/(app)/kegs/history/page.tsx");
    expect(page).toMatch(/<KegHistoryView\b/);
  });
});
