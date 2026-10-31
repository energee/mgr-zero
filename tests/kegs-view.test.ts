// tests/kegs-view.test.ts — Keg fleet, Customer keg balance, and Keg event
// history. Views own no sample data. Live PoolForm / KegEventForm wrap the
// shared KegPoolFields / KegEventFields in their command forms.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { KegBalanceView } from "../components/mgr/views/keg-balance";
import { KegEventFields, KegFleetView, KegPoolFields } from "../components/mgr/views/keg-fleet";
import { KegHistoryView } from "../components/mgr/views/keg-history";
import { KEG_EVENT_REASONS } from "../lib/mgr/enums";
import { kegBalanceRidgeline, kegFleet, kegHistoryLedger } from "../lib/mgr/fixtures/kegs";
import { toKegBalanceViewProps } from "../lib/mgr/keg-balance-view";
import { kegEventFieldErrors, kegEventReason, kegOnHand, kegPoolFieldErrors, kegShortageText, toKegFleetViewProps, withLocationBin, type KegPoolValue } from "../lib/mgr/keg-fleet-view";
import { REASON_EFFECT, REASON_LABEL } from "../lib/mgr/keg-labels";
import { kegHistoryScope, toKegHistoryViewProps } from "../lib/mgr/keg-history-view";
import { formatDate } from "../lib/date-format";
import { activeTab, STAFF_NAV } from "../lib/mgr/nav";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Keg fleet", () => {
  const pool: KegPoolValue = { name: "Owned", kind: "owned", vendorId: "", perFill: "", deposit: "", active: true };

  it.each(["-5", "1.234", "1e1", "nope"])("#1381 rejects invalid deposit %s", (deposit) => {
    const value = { ...pool, deposit };
    expect(kegPoolFieldErrors(value).deposit).toBeTruthy();
  });

  it("#1479 names the int-cent limit for pool money", () => {
    expect(kegPoolFieldErrors({ ...pool, deposit: "99999999999" }).deposit).toBe("Enter an amount no greater than $21,474,836.47.");
    expect(kegPoolFieldErrors({ ...pool, kind: "pay_per_fill", vendorId: "v", perFill: "21474836.48" }).perFill).toBe("Enter an amount no greater than $21,474,836.47.");
    expect(kegPoolFieldErrors({ ...pool, deposit: "21474836.47" })).toEqual({});
  });

  it.each(["0.00", "5.25", ""])("#1381 accepts deposit %s without making it required", (deposit) => {
    const value = { ...pool, deposit };
    expect(kegPoolFieldErrors(value)).toEqual({});
  });

  it.each(["owned", "leased", "pay_per_fill"] as const)("#1381 validates per-fill cost for %s pools", (kind) => {
    const value = { ...pool, kind, vendorId: "vendor" };
    expect(Boolean(kegPoolFieldErrors(value).perFill)).toBe(kind === "pay_per_fill");
    for (const perFill of ["-1", "1.234", "1e1"]) {
      expect(kegPoolFieldErrors({ ...value, perFill }).perFill).toBeTruthy();
    }
    expect(kegPoolFieldErrors({ ...value, perFill: "0.00" })).toEqual({});
    expect(kegPoolFieldErrors({ ...value, perFill: "5.25" })).toEqual({});
  });
  it("#1381 links pool money errors to each input after an attempt", () => {
    const value = { ...pool, deposit: "-5", perFill: "1.234" };
    const html = htmlOf(createElement(KegPoolFields, { value, vendors: [], onChange: () => {}, attempted: true }));
    for (const id of ["pool-deposit", "pool-per-fill"]) {
      const input = new RegExp(`<input\\b[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
      expect(input).toContain('aria-invalid="true"');
      const descriptions = /aria-describedby="([^"]+)"/.exec(input!)?.[1].split(/\s+/);
      expect(descriptions).toContain(`${id}-error`);
      expect(html).toContain(`id="${id}-error"`);
    }
  });

  it("#815 prints each saved location shortage with its pool and size", () => {
    const shortages = [{ pool: "Owned", keg_size: "half_bbl", location: "Warehouse", short: 2 }];
    const model = toKegFleetViewProps({ ...kegFleet, shortages: shortages.map(kegShortageText) });
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
    expect(body.props.model).toEqual(toKegFleetViewProps(kegFleet));
  });

  it("#1584 Record keg event is the header action and Add keg pool sits below the pools", () => {
    const pools = [{ key: "owned", title: "Owned pool", detail: "Owned · 4 on hand", bins: [] }];
    const live = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps({ pools, navRows: [] }),
      createAction: createElement("button", null, "Add keg pool"), eventForm: createElement("button", null, "Record keg event") }));
    expect(live.indexOf("Record keg event")).toBeLessThan(live.indexOf("Owned pool"));
    expect(live.indexOf("Add keg pool")).toBeGreaterThan(live.indexOf("Owned pool"));
    const unavailable = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps({ pools, navRows: [], eventUnavailable: "Recording a keg event needs a location." }), eventForm: null }));
    expect(unavailable.indexOf("Recording a keg event needs a location.")).toBeLessThan(unavailable.indexOf("Owned pool"));
    const inventory = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps(kegFleet) }));
    expect(inventory.indexOf(">Record keg event<")).toBeLessThan(inventory.indexOf("Pool name"));
    expect(readFileSync("app/(app)/kegs/pool-form.tsx", "utf8")).toMatch(/<Button size="sm" variant="outline">\{pool \? "Edit" : "Add keg pool"\}<\/Button>/);
  });

  it("renders Record keg event without leaking live hrefs", () => {
    const html = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps(kegFleet) }));
    expect(html).toMatch(/>Record keg event</);
    expect(html).toMatch(/Kegline/);
    expect(html).not.toMatch(/href="\/kegs/);
    expect(html).not.toMatch(/href="\/inventory"/);
  });

  it("#974 Reason is a labeled select stating the chosen reason's effect, for each of the six manual reasons", () => {
    expect(Object.keys(REASON_EFFECT)).toEqual([...KEG_EVENT_REASONS]);
    for (const reason of KEG_EVENT_REASONS) {
      const html = htmlOf(createElement(KegEventFields, { value: { ...kegFleet.eventForm!, reason }, options: kegFleet.eventOptions!, onChange: () => {} }));
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
    const html = htmlOf(createElement(KegFleetView, { model: toKegFleetViewProps({ ...kegFleet, backHref: parent.href }) }));
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
    const html = htmlOf(createElement(KegEventFields, { value: kegFleet.eventForm!, options: kegFleet.eventOptions! }));
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
  it("#1401 renders the empty-keg helper as information, not a warning", () => {
    const html = htmlOf(createElement(KegEventFields, { value: kegFleet.eventForm!, options: kegFleet.eventOptions! }));
    const notice = html.match(/<div[^>]*role="note"[^>]*>.*?Empty kegs only\..*?<\/div><\/div>/)?.[0];
    expect(notice).toContain("bg-info");
    expect(notice).not.toContain("bg-warning");
  });

  it.each(["1.5", "1e1", "0", "", "-1", "9007199254740992"])("#1381 rejects invalid keg count %s", (qty) => {
    const value = { ...kegFleet.eventForm!, poolId: "pool", locationId: "location", binId: "bin", customerId: "customer", qty };
    expect(kegEventReason(value)).toBeTruthy();
    expect(kegEventFieldErrors(value).qty).toBeTruthy();
  });

  it("#1381 accepts a whole positive count and preserves required choices", () => {
    const value = { ...kegFleet.eventForm!, poolId: "pool", locationId: "location", binId: "bin", customerId: "customer", qty: "3" };
    expect(kegEventReason(value)).toBeNull();
    expect(kegEventFieldErrors(value)).toEqual({});
    expect(kegEventReason({ ...value, binId: "" })).toBeTruthy();
    expect(kegEventReason({ ...value, reason: "shipped", customerId: "" })).toBeTruthy();
  });

  it("#1479 holds a count leaving the bin to the kegs it holds", () => {
    const value = { ...kegFleet.eventForm!, poolId: "pool", locationId: "location", binId: "cold", reason: "lost" as const, customerId: "", qty: "9" };
    const options = { ...kegFleet.eventOptions!, bins: [{ value: "cold", label: "Cold" }], onHand: 8 };
    expect(kegEventFieldErrors(value, options).qty).toBe("Enter at most 8 kegs in Cold.");
    expect(kegEventReason(value, options)).toBe("Still needed: at most 8 kegs in Cold.");
    expect(kegEventFieldErrors({ ...value, qty: "8" }, options)).toEqual({});
    expect(kegEventFieldErrors({ ...value, reason: "retired" }, options).qty).toBe("Enter at most 8 kegs in Cold.");
    expect(kegEventFieldErrors({ ...value, reason: "shipped", customerId: "customer" }, options).qty).toBe("Enter at most 8 kegs in Cold.");
    // Incoming kegs do not leave the bin.
    for (const reason of ["acquired", "found"] as const) expect(kegEventFieldErrors({ ...value, reason }, options)).toEqual({});
    // Without a known count (the inventory fixture), nothing is held back.
    expect(kegEventFieldErrors(value)).toEqual({});
  });

  it("#1479 holds a count returned or lost at a customer to the kegs that customer holds", () => {
    const value = { ...kegFleet.eventForm!, poolId: "pool", locationId: "location", binId: "cold", reason: "returned" as const, customerId: "ridge", qty: "5" };
    const options = { ...kegFleet.eventOptions!, bins: [{ value: "cold", label: "Cold" }], customers: [{ value: "ridge", label: "Ridgeline" }], onHand: 4 };
    expect(kegEventFieldErrors(value, options).qty).toBe("Enter at most 4 kegs at Ridgeline.");
    expect(kegEventReason(value, options)).toBe("Still needed: at most 4 kegs at Ridgeline.");
    expect(kegEventFieldErrors({ ...value, reason: "lost" }, options).qty).toBe("Enter at most 4 kegs at Ridgeline.");
    expect(kegEventFieldErrors({ ...value, qty: "4" }, options)).toEqual({});
  });

  it("#1479 counts on hand from the customer's balance when kegs come from a customer, else from the bin", () => {
    const stock = [{ pool_id: "p", keg_size: "half_bbl", bin_id: "cold", qty: 8 }];
    const balances = [{ customer_id: "ridge", pool_id: "p", keg_size: "half_bbl", qty: 4 }, { customer_id: "ridge", pool_id: "p", keg_size: "sixth_bbl", qty: 9 }];
    const value = { ...kegFleet.eventForm!, poolId: "p", kegSize: "half_bbl" as const, binId: "cold", customerId: "ridge", reason: "returned" as const };
    expect(kegOnHand(value, stock, balances)).toBe(4);
    expect(kegOnHand({ ...value, reason: "lost" }, stock, balances)).toBe(4);
    expect(kegOnHand({ ...value, customerId: "other" }, stock, balances)).toBe(0);
    expect(kegOnHand({ ...value, reason: "lost", customerId: "" }, stock, balances)).toBe(8);
    expect(kegOnHand({ ...value, reason: "shipped" }, stock, balances)).toBe(8);
    expect(kegOnHand({ ...value, reason: "retired", binId: "empty" }, stock, balances)).toBe(0);
    // Nothing chosen yet, or kegs coming in: no limit.
    expect(kegOnHand({ ...value, customerId: "" }, stock, balances)).toBeUndefined();
    expect(kegOnHand({ ...value, reason: "retired", binId: "" }, stock, balances)).toBeUndefined();
    expect(kegOnHand({ ...value, reason: "acquired" }, stock, balances)).toBeUndefined();
  });

  it("#1479 the live form passes the chosen bin's kegs on hand", () => {
    expect(src("app/(app)/kegs/page.tsx")).toMatch(/<KegEventForm\b[^>]*\bstock=\{fleet\.rows\}[^>]*\bbalances=\{fleet\.balances\}/);
    expect(src("app/(app)/kegs/customers/[customerId]/page.tsx")).toMatch(/<KegEventForm\b[^>]*\bbalances=\{fleet\.balances\}/);
    expect(src("app/(app)/kegs/event-form.tsx")).toMatch(/options=\{\{[^}]*\bonHand\b/);
  });
  it("#1381 waits for blur or an attempt before drawing a fractional count error", () => {
    const props = { value: { ...kegFleet.eventForm!, qty: "1.5" }, options: kegFleet.eventOptions!, onChange: () => {} };
    expect(htmlOf(createElement(KegEventFields, props))).not.toContain('id="keg-qty-error"');
    const html = htmlOf(createElement(KegEventFields, { ...props, attempted: true }));
    expect(html).toContain('id="keg-qty-error"');
    expect(html).toMatch(/id="keg-qty"[^>]*aria-invalid="true"/);
  });
  it("#1381 preserves the shared exponent reason without drawing it twice", () => {
    const html = htmlOf(createElement(KegEventFields, {
      value: { ...kegFleet.eventForm!, qty: "1e1" }, options: kegFleet.eventOptions!, onChange: () => {}, attempted: true,
    }));
    expect(html.match(/data-slot="field-error"/g)).toHaveLength(1);
    expect(html).toContain('id="keg-qty-error"');
  });


  it("#1025 resets the bin when the location changes, in live and inventory alike", () => {
    const value = kegFleet.eventForm!;
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
  });

  it("#1030 asks to widen the filter only when a filter is set", () => {
    expect(toKegHistoryViewProps({}).empty).toEqual({ title: "No keg events yet", description: "Record a keg event to start the history.", action: "Record keg event" });
    const widen = { title: "No matching events", description: "Widen the filter to see more of the keg's history." };
    expect(toKegHistoryViewProps({ pool: "sixth" }).empty).toEqual(widen);
    expect(toKegHistoryViewProps({ customer: "ridgeline" }).empty).toEqual(widen);
    expect(toKegHistoryViewProps({ rows: [{ key: "e", title: "Found", detail: "" }] }).empty).toBeUndefined();
  });

  it("#1517 an empty history opens Record keg event on Keg fleet", () => {
    expect(toKegHistoryViewProps({ backHref: "/kegs" }).empty?.href).toBe("/kegs?recordEvent=1");
    const html = htmlOf(createElement(KegHistoryView, { model: toKegHistoryViewProps({ backHref: "/kegs" }) }));
    expect(html).toMatch(/<a[^>]*href="\/kegs\?recordEvent=1"[^>]*>Record keg event<\/a>/);
    // The inventory passes no backHref, so the button is drawn but goes nowhere.
    expect(toKegHistoryViewProps({}).empty?.href).toBeUndefined();
  });

  it("#1517 ?recordEvent=1 opens the Record keg event sheet on Keg fleet", () => {
    expect(src("app/(app)/kegs/page.tsx")).toMatch(/autoOpen=\{recordEvent === "1"\}/);
    expect(src("app/(app)/kegs/event-form.tsx")).toMatch(/defaultOpen: autoOpen/);
  });

});
