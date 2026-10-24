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
import { kegShortageText, toKegFleetViewProps, withLocationBin } from "../lib/mgr/keg-fleet-view";
import { REASON_EFFECT, REASON_LABEL } from "../lib/mgr/keg-labels";
import { kegHistoryScope, toKegHistoryViewProps } from "../lib/mgr/keg-history-view";
import { formatDate } from "../lib/date-format";
import { activeTab, STAFF_NAV } from "../lib/mgr/nav";

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


  it("#1110 the live back link goes to the nav group that holds Kegs", () => {
    const parent = activeTab(STAFF_NAV, "/kegs")!;
    expect(parent.label).toBe("Beer");
    expect(src("app/(app)/kegs/page.tsx")).toContain(`backHref: "${parent.href}"`);
    const html = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps({ ...kegFleetMicrostar, backHref: parent.href }) }));
    expect(html).toMatch(new RegExp(`<a[^>]*href="${parent.href}"[^>]*>.*?Beer</a>`));
  });

  it("the live kegs page mounts KegFleetView and slots PoolForm", () => {
    const page = src("app/(app)/kegs/page.tsx");
    expect(page).toMatch(/<KegFleetView\b/);
    expect(page).not.toMatch(/\blist=/);
    expect(page).not.toMatch(/\bnavs=/);
    expect(page).toMatch(/<PoolForm\b/);
    expect(page).toMatch(/<KegEventForm\b/);
    expect(page).not.toMatch(/\bnote=/);
    const html = htmlOf(createElement(KegEventFields, { value: kegFleetMicrostar.eventForm!, options: kegFleetMicrostar.eventOptions! }));
    expect(html.match(/Beer coming back with a keg/g)).toHaveLength(1);
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

describe("Record keg event", () => {
  it("#1025 resets the bin when the location changes, in live and inventory alike", () => {
    const value = kegFleetMicrostar.eventForm!;
    expect(withLocationBin(value, { ...value, locationId: "cold" }, () => "")).toMatchObject({ locationId: "cold", binId: "" });
    expect(withLocationBin(value, { ...value, locationId: "cold" }, (id) => `${id}-first`).binId).toBe("cold-first");
    expect(withLocationBin(value, { ...value, qty: "9" }, () => "")).toMatchObject({ binId: value.binId, qty: "9" });
    for (const file of ["components/mgr/views/keg-event-form.tsx", "app/(app)/kegs/event-form.tsx"]) expect(src(file), file).toMatch(/withLocationBin\(/);
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

  it("#1025 prints inventory dates the way the live page does", () => {
    for (const row of kegHistoryLedger.rows!) {
      const day = row.detail.split(" · ")[0];
      // Live formats each event with formatDate ("Sep 3, 2026"); "9/03" was the old fixture.
      expect(formatDate(new Date(`${day} UTC`), "UTC"), row.key).toBe(day);
    }
  });

  const POOL = "11111111-1111-4111-8111-111111111111";
  const CUSTOMER = "22222222-2222-4222-8222-222222222222";
  const pools = [{ id: POOL, name: "Owned ½ bbl" }];
  const customers = [{ id: CUSTOMER, name: "Ridgeline" }];

  it("#1025 links each pool and customer option to the page with that scope changed", () => {
    const scope = kegHistoryScope({});
    expect(scope).toMatchObject({ poolId: undefined, customerId: undefined });
    expect(scope.poolOptions(pools).map((o) => o.href)).toEqual(["/kegs/history", `/kegs/history?pool=${POOL}`]);
    expect(scope.customerOptions(customers).map((o) => o.href)).toEqual(["/kegs/history", `/kegs/history?customer=${CUSTOMER}`]);
  });

  it("#1025 keeps the other filter when one changes, so the two combine", () => {
    const byCustomer = kegHistoryScope({ customer: CUSTOMER });
    expect(byCustomer.customerId).toBe(CUSTOMER);
    expect(byCustomer.poolOptions(pools).map((o) => o.href)).toEqual([`/kegs/history?customer=${CUSTOMER}`, `/kegs/history?customer=${CUSTOMER}&pool=${POOL}`]);
    const both = kegHistoryScope({ pool: POOL, customer: CUSTOMER });
    expect(both.customerOptions(customers)[0].href).toBe(`/kegs/history?pool=${POOL}`);
    expect(both.poolOptions(pools)[0].href).toBe(`/kegs/history?customer=${CUSTOMER}`);
  });

  it("#1025 ignores a scope that is not one uuid", () => {
    expect(kegHistoryScope({ pool: "nope", customer: ["x", "y"] })).toMatchObject({ poolId: undefined, customerId: undefined });
  });

  it("#972 labels the Keg pool and Customer controls, pool first, each showing its selection", () => {
    const model = toKegHistoryViewProps({
      pool: "sixth",
      poolOptions: [{ value: "all", label: "All pools" }, { value: "sixth", label: "Owned ⅙ bbl" }],
      customer: "ridgeline",
      customerOptions: [{ value: "all", label: "All customers" }, { value: "ridgeline", label: "Ridgeline Tap Room" }],
    });
    const html = htmlOf(createElement(KegHistoryView, { model }));
    // The visible label names the control it is for, and that control shows the pick.
    const control = (label: string) => {
      const id = new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${label}</label>`).exec(html)?.[1];
      const at = id === undefined ? -1 : html.indexOf(`id="${id}"`);
      return at < 0 ? undefined : html.slice(at, html.indexOf("</button>", at)).replace(/<[^>]+>/g, "");
    };
    expect(control("Keg pool")).toContain("Owned ⅙ bbl");
    expect(control("Customer")).toContain("Ridgeline Tap Room");
    expect(html.indexOf(">Keg pool<")).toBeLessThan(html.indexOf(">Customer<"));
    const customerTrigger = /<button[^>]*aria-label="Customer"[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0];
    expect(customerTrigger).toContain('data-variant="outline"');
    expect(customerTrigger).toContain("<svg");
  });

  it("#1030 asks to widen the filter only when a filter is set", () => {
    expect(toKegHistoryViewProps({}).empty).toEqual({ title: "No keg events yet", description: "Record a keg event on Keg fleet to start the history." });
    const widen = { title: "No matching events", description: "Widen the filter to see more of the keg's history." };
    expect(toKegHistoryViewProps({ pool: "sixth" }).empty).toEqual(widen);
    expect(toKegHistoryViewProps({ customer: "ridgeline" }).empty).toEqual(widen);
    expect(toKegHistoryViewProps({ rows: [{ key: "e", title: "Found", detail: "" }] }).empty).toBeUndefined();
  });

});

describe("Record keg event pinned footer (#1037)", () => {
  it("submits the body's form from the pinned footer, with the error beside it", () => {
    const src = readFileSync("components/mgr/views/keg-event-form.tsx", "utf8");
    const footer = src.slice(src.indexOf("footer={"), src.indexOf("<form id="));
    expect(footer).toContain('<Button type="submit" form={formId}');
    expect(footer).toContain("<CommandFormMessage error={error} />");
    expect(src).toContain("<form id={formId}");
  });
});
