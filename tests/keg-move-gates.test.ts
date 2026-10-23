// tests/keg-move-gates.test.ts — #761: Keg fleet and Move stock share E
// controls through the shared view, and an unavailable action says why.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KegFleetView, KegEventFields, KegPoolFields } from "@/components/mgr/views/keg-fleet";
import { kegFleetMicrostar } from "@/lib/mgr/fixtures/kegs";
import { kegEventUnavailable, needsKegCustomer, toKegFleetViewProps, type KegPoolValue } from "@/lib/mgr/keg-fleet-view";
import { toLocationBinsViewProps } from "@/lib/mgr/location-bins-view";
import { LocationBinsView } from "@/components/mgr/views/location-bins";

const src = (file: string) => readFileSync(file, "utf8");
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("unavailable reasons", () => {
  it("names what keg event entry is missing", () => {
    expect(kegEventUnavailable({ activePools: 0, locations: 1 })).toMatch(/pool in service/);
    expect(kegEventUnavailable({ activePools: 1, locations: 0 })).toMatch(/location/);
    expect(kegEventUnavailable({ activePools: 0, locations: 0 })).toMatch(/pool in service.*location|location.*pool in service/);
    expect(kegEventUnavailable({ activePools: 1, locations: 1 })).toBeNull();
  });

  it("names what a bin move is missing; an empty location is an empty state instead (#1154)", () => {
    const location = { id: "l", name: "Taproom" };
    const bins = [{ id: "a", name: "Cold" }, { id: "b", name: "Dry" }];
    expect(toLocationBinsViewProps({ location, bins: bins.slice(0, 1), stock: [{ bin_id: "a" }] }).moveUnavailable).toMatch(/two bins/);
    expect(toLocationBinsViewProps({ location, bins, stock: [] }).moveUnavailable).toBeNull();
    expect(toLocationBinsViewProps({ location, bins, stock: [] }).empty?.title).toBe("Nothing is stored in these bins yet");
    expect(toLocationBinsViewProps({ location, bins, stock: [{ bin_id: "a" }] }).moveUnavailable).toBeNull();
  });

  it("requires a customer only for shipped and returned", () => {
    expect(needsKegCustomer("shipped")).toBe(true);
    expect(needsKegCustomer("returned")).toBe(true);
    expect(needsKegCustomer("lost")).toBe(false);
  });
});

describe("Keg fleet shared fields", () => {
  it("shows the reason in place of a hidden Record keg event", () => {
    const out = html(createElement(KegFleetView, { model: toKegFleetViewProps({ pools: [], navRows: [], eventUnavailable: "Add a keg pool in service first." }), eventForm: null }));
    expect(out).toContain("Record keg event");
    expect(out).toContain("Add a keg pool in service first.");
  });

  it("the inventory pool controls and shared event fields use the same labels as live", () => {
    const inventory = html(createElement(KegFleetView, { model: toKegFleetViewProps(kegFleetMicrostar) }));
    const event = html(createElement(KegEventFields, { value: kegFleetMicrostar.eventForm!, options: kegFleetMicrostar.eventOptions! }));
    for (const label of ["Pool name", "Kind", "Vendor", "Per-fill cost ($)", "Deposit per keg ($)"]) expect(inventory).toContain(label);
    for (const label of ["Keg pool", "Size", "Bin", "Customer", "Kegs", "Note"]) expect(event).toContain(label);
  });

  it("Location bins shows why Move stock is unavailable instead of the form", () => {
    const out = html(createElement(LocationBinsView, { model: { title: "Bins at Taproom", backLabel: "Taproom", rows: [], moveUnavailable: "Moving stock needs at least two bins at this location. Add a bin first." }, footer: createElement("button", null, "live form") }));
    expect(out).toContain("Move stock");
    expect(out).toContain("Add a bin first.");
    expect(out).not.toContain("live form");
  });

  it("says which pools each money field applies to, and why an owned pool has no vendor (#1119)", () => {
    const fields = (kind: KegPoolValue["kind"], editing = false) => html(createElement(KegPoolFields, { value: { name: "A", kind, vendorId: "", perFill: "", deposit: "0.00", active: true }, vendors: [], editing, onChange: () => {} }));
    const owned = fields("owned");
    expect(owned).toContain("None · the brewery owns these kegs");
    expect(owned).not.toContain("owned pools have no vendor");
    for (const kind of ["owned", "leased"] as const) expect(fields(kind)).toContain("Only a Pay per fill pool needs this. Leave it blank.");
    expect(fields("pay_per_fill")).toContain("Required: what the vendor charges for each keg filled.");
    // update_keg_pool keeps a stored cost when the field is cleared, so Edit never says to leave it blank.
    for (const kind of ["owned", "leased"] as const) {
      const edit = fields(kind, true);
      expect(edit).toContain("Only a Pay per fill pool needs this. Once set, it can be changed but not removed.");
      expect(edit).not.toContain("Leave it blank");
    }
    // ensure_order_deposit_lines charges deposits on wholesale orders only.
    expect(owned).toContain("Charged on wholesale orders for each keg from this pool. 0 means no deposit.");
    expect(owned).toMatch(/id="pool-per-fill"[^>]*aria-describedby="pool-per-fill-help"|aria-describedby="pool-per-fill-help"[^>]*id="pool-per-fill"/);
    expect(owned).toMatch(/id="pool-deposit"[^>]*aria-describedby="pool-deposit-help"|aria-describedby="pool-deposit-help"[^>]*id="pool-deposit"/);
  });

  it("pool and event fields are E controls, with an In service switch", () => {
    const pool = html(createElement(KegPoolFields, { value: { name: "A", kind: "owned", vendorId: "", perFill: "", deposit: "30.00", active: true }, vendors: [], editing: true, onChange: () => {} }));
    expect(pool).toContain('role="switch"');
    // Radix's Switch carries its own aria-hidden checkbox; a raw one would not be hidden.
    expect(pool).not.toMatch(/<input type="checkbox"(?![^>]*aria-hidden)/);
    const event = html(createElement(KegEventFields, { value: { poolId: "p", kegSize: "half_bbl", reason: "acquired", locationId: "", binId: "", customerId: "", qty: "", note: "" }, options: { pools: [{ value: "p", label: "Owned" }], locations: [], bins: [], customers: [] }, onChange: () => {} }));
    expect(event).toContain('id="keg-reason"');
    expect(event).not.toContain("Customer");
  });

  it("live forms delegate to shared controls rather than drawing raw controls", () => {
    const pool = src("app/(app)/kegs/pool-form.tsx");
    expect(pool).toMatch(/<KegPoolFields\b/);
    expect(pool).not.toMatch(/components\/ui\/(select|input|label)"/);
    expect(pool).not.toMatch(/<input\b/);
    const event = src("app/(app)/kegs/event-form.tsx");
    expect(event).toMatch(/<KegEventPresentation\b/);
    expect(event).not.toMatch(/components\/ui\/(select|input|label)"/);
    expect(event).not.toMatch(/<input\b/);
    expect(src("app/(app)/locations/move-stock-form.tsx")).not.toMatch(/components\/ui\/(select|input|label)"/);
    expect(src("app/(app)/locations/move-stock-form.tsx")).toMatch(/<MoveStockFields\b/);
    expect(src("app/(app)/kegs/page.tsx")).toMatch(/kegEventUnavailable/);
  });
});
