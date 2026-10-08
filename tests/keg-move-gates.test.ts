// tests/keg-move-gates.test.ts — #761: Keg fleet and Move stock share E
// controls through the shared view, and an unavailable action says why.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KegFleetView, KegEventFields, KegPoolFields } from "@/components/mgr/views/keg-fleet";
import { kegFleetMicrostar } from "@/lib/mgr/fixtures/kegs";
import { kegEventUnavailable, needsKegCustomer, toKegFleetViewProps } from "@/lib/mgr/keg-fleet-view";
import { moveStockUnavailable } from "@/lib/movement-form";
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

  it("names what a bin move is missing", () => {
    expect(moveStockUnavailable({ bins: 1, stock: 3 })).toMatch(/two bins/);
    expect(moveStockUnavailable({ bins: 2, stock: 0 })).toMatch(/No stock/);
    expect(moveStockUnavailable({ bins: 2, stock: 1 })).toBeNull();
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

  it("the inventory draws the same fields as the live forms", () => {
    const out = html(createElement(KegFleetView, { model: toKegFleetViewProps(kegFleetMicrostar) }));
    for (const label of ["Pool name", "Kind", "Vendor", "Per-fill cost ($)", "Deposit per keg ($)", "Keg pool", "Size", "Bin", "Customer", "Kegs", "Note"]) expect(out).toContain(label);
  });

  it("Location bins shows why Move stock is unavailable instead of the form", () => {
    const out = html(createElement(LocationBinsView, { model: { backLabel: "Taproom", rows: [], moveUnavailable: "Moving stock needs at least two bins at this location. Add a bin first." }, footer: createElement("button", null, "live form") }));
    expect(out).toContain("Move stock");
    expect(out).toContain("Add a bin first.");
    expect(out).not.toContain("live form");
  });

  it("pool and event fields are E controls, with an In service switch", () => {
    const pool = html(createElement(KegPoolFields, { value: { name: "A", kind: "owned", vendorId: "", perFill: "", deposit: "30.00", active: true }, vendors: [], editing: true, onChange: () => {} }));
    expect(pool).toContain('role="switch"');
    // Radix's Switch carries its own aria-hidden checkbox; a raw one would not be hidden.
    expect(pool).not.toMatch(/<input type="checkbox"(?![^>]*aria-hidden)/);
    const event = html(createElement(KegEventFields, { value: { poolId: "p", kegSize: "half_bbl", reason: "acquired", locationId: "", binId: "", customerId: "", qty: "", note: "" }, options: { pools: [{ value: "p", label: "Owned" }], locations: [], bins: [], customers: [] }, onChange: () => {} }));
    expect(event).toContain("toggle-group-item");
    expect(event).not.toContain("Customer");
  });

  it("live forms mount the shared fields instead of ui/select, ui/input or a raw checkbox", () => {
    for (const [file, view] of [["app/(app)/kegs/pool-form.tsx", "KegPoolFields"], ["app/(app)/kegs/event-form.tsx", "KegEventFields"]]) {
      const source = src(file);
      expect(source, file).toMatch(new RegExp(`<${view}\\b`));
      expect(source, file).not.toMatch(/components\/ui\/(select|input|label)"/);
      expect(source, file).not.toMatch(/<input\b/);
    }
    expect(src("app/(app)/locations/move-stock-form.tsx")).not.toMatch(/components\/ui\/(select|input|label)"/);
    expect(src("app/(app)/locations/move-stock-form.tsx")).toMatch(/<MoveStockFields\b/);
    expect(src("app/(app)/locations/[id]/bins/page.tsx")).toMatch(/moveStockUnavailable/);
    expect(src("app/(app)/kegs/page.tsx")).toMatch(/kegEventUnavailable/);
  });
});
