// tests/form-feedback.test.ts — the three shared form-feedback primitives:
// a withheld submit names what is missing (#1122, #1128), an empty picker says
// where to add the record (#1123), and a bad value is marked at its field
// (#1121). Pure reason builders first, then the E controls' aria wiring.
import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { E } from "@/components/mgr/e";
import { submitReason } from "@/lib/mgr/submit-reason";
import { orderFormReadiness, orderLineError, orderLineErrors } from "@/lib/order-form-rules";
import { scheduleBatchReason } from "@/lib/mgr/schedule-batch-view";
import { newPoReason, poLineErrors } from "@/lib/mgr/new-po-view";
import { newTransferReason } from "@/lib/mgr/new-transfer-view";
import { routeReason } from "@/lib/mgr/route-view";
import { repackReason } from "@/lib/mgr/repack-view";
import { replenishmentQuantityReason, replenishReason } from "@/lib/replenishment-form";
import { pickSheetPrintReason } from "@/lib/mgr/pick-sheet-view";

const html = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("submitReason", () => {
  it("names what is missing as one sentence, or null when nothing is", () => {
    expect(submitReason([])).toBeNull();
    expect(submitReason(["a vendor"])).toBe("To save, add a vendor.");
    expect(submitReason(["a vendor", "a quantity"])).toBe("To save, add a vendor and a quantity.");
  });

  it("is the conjunction the order hint already used", () => {
    const hint = orderFormReadiness({ kind: "wholesale", customerId: "", shipToId: "", fromLocationId: "", toLocationId: "", lines: [], catalog: { customers: 0, locations: 0, skus: 0 } }).hint;
    expect(hint).toBe("Before creating an order, add a customer, a location, and a SKU.");
  });
});

describe("per-form reasons", () => {
  it("Schedule batch needs a date and planned barrels above zero", () => {
    expect(scheduleBatchReason({ date: "", plannedBbl: "" })).toBe("To save, add a date and planned barrels above zero.");
    expect(scheduleBatchReason({ date: "2026-10-22", plannedBbl: "-1" })).toBe("To save, add planned barrels above zero.");
    expect(scheduleBatchReason({ date: "2026-10-22", plannedBbl: "1.5" })).toBeNull();
  });

  it("New PO needs a vendor and, on each line, a material, a quantity above zero and no negative cost", () => {
    expect(newPoReason({ vendor: "", lines: [{ materialId: "", qty: "", cost: "" }] }))
      .toBe("To save, add a vendor, a material on each line, and a quantity above zero on each line.");
    expect(newPoReason({ vendor: "v", lines: [{ materialId: "m", qty: "0.5", cost: "" }] })).toBeNull();
    expect(newPoReason({ vendor: "v", lines: [{ materialId: "m", qty: "4", cost: "-3" }] })).toBe("To save, add a unit cost of zero or more.");
  });

  it("New PO marks a bad quantity or cost on its own field, never a blank one", () => {
    expect(poLineErrors({ qty: "", cost: "" })).toEqual({});
    expect(poLineErrors({ qty: "-4", cost: "-3" })).toEqual({ qty: "Enter a quantity above zero.", cost: "Enter a cost of zero or more." });
    expect(poLineErrors({ qty: 0.5, cost: "0" })).toEqual({});
  });

  it("New transfer needs both ends and a complete line, and refuses an entered line it cannot send", () => {
    const ends = { fromId: "a", toId: "b", fromBinId: "a1", toBinId: "b1" };
    expect(newTransferReason({ fromId: "", toId: "", fromBinId: "", toBinId: "", lines: [{ skuId: "", qty: "" }] }))
      .toBe("To save, add a From location, a To location, and a SKU with a quantity above zero on each line.");
    expect(newTransferReason({ ...ends, toBinId: "", lines: [{ skuId: "s", qty: "2" }] })).toBe("To save, add a To bin.");
    expect(newTransferReason({ ...ends, toId: "a", lines: [{ skuId: "s", qty: "2" }] })).toBe("To save, add a To location other than the From location.");
    expect(newTransferReason({ ...ends, lines: [{ skuId: "s", qty: "2" }, { skuId: "", qty: "" }] })).toBeNull();
    // A typed line that cannot be sent blocks the save instead of being dropped (#1121).
    expect(newTransferReason({ ...ends, lines: [{ skuId: "s", qty: "2" }, { skuId: "t", qty: "-2" }] })).toBe("To save, add a SKU with a quantity above zero on each line.");
  });

  it("the transfer form sends every entered line and drops only blank spare rows", () => {
    const form = readFileSync("app/(app)/transfers/new-transfer-form.tsx", "utf8");
    expect(form).not.toMatch(/filter\(\(l\) => l\.skuId && Number\(l\.qty\) > 0\)/);
    expect(form).toContain("isBlankLine");
  });

  it("each order or transfer line has its own error, and the list is built from it", () => {
    const lines = [{ skuId: "s", qty: "2" }, { skuId: "s", qty: "" }, { skuId: "", qty: "" }];
    expect(orderLineError(lines[0], 0, 3)).toBeUndefined();
    expect(orderLineError(lines[1], 1, 3)).toBe("Line 2: select a SKU and enter a quantity greater than zero, or remove the line.");
    expect(orderLineError(lines[2], 2, 3)).toBeUndefined();
    expect(orderLineErrors(lines)).toEqual([orderLineError(lines[1], 1, 3)]);
  });

  it("Route needs a delivery date and a stop", () => {
    expect(routeReason({ date: "", selection: {} })).toBe("To save, add a delivery date and a stop.");
    expect(routeReason({ date: "2026-10-22", selection: { o: 1 } })).toBeNull();
  });

  it("Repack needs a SKU to break, a location, a bin and a quantity above zero", () => {
    expect(repackReason({ parentSkuId: "", locationId: "", binId: "", qty: "" })).toBe("To save, add a SKU to break, a location, a bin, and a quantity above zero.");
    expect(repackReason({ parentSkuId: "p", locationId: "l", binId: "b", qty: "2" })).toBeNull();
  });

  it("par and standing allocation need a SKU and a quantity of zero or more", () => {
    expect(replenishmentQuantityReason("sku", "0")).toBeNull();
    expect(replenishmentQuantityReason("sku", "2.5")).toBeNull();
    for (const qty of ["", " ", "-1", "NaN", "Infinity"]) expect(replenishmentQuantityReason("sku", qty)).toBe("To save, add a quantity of zero or more.");
    expect(replenishmentQuantityReason("", "1")).toBe("To save, add a SKU.");
  });

  it("a replenishment order needs a source warehouse and a positive line", () => {
    expect(replenishReason("", [])).toBe("To save, add a warehouse to send from and a transfer quantity above zero.");
    expect(replenishReason("w", [{ skuId: "s", qty: 1 }])).toBeNull();
  });

  it("Pick sheet print is withheld while the sheet is empty (#1128)", () => {
    expect(pickSheetPrintReason({ groups: [], empty: { title: "Nothing confirmed to pick", description: "" } })).toBe("Nothing confirmed to pick");
    expect(pickSheetPrintReason({ groups: [{ key: "d", title: "d", rows: [], totals: [] }] })).toBeNull();
  });
});

describe("E.submit", () => {
  it("withholds the button and ties the visible reason to it", () => {
    const markup = html(E.submit("Save draft", { reason: "To save, add a vendor.", id: "po-save" }));
    expect(markup).toMatch(/<button[^>]*id="po-save"[^>]*disabled=""/);
    expect(markup).toMatch(/aria-describedby="po-save-reason"/);
    expect(markup).toMatch(/<p id="po-save-reason"[^>]*>To save, add a vendor\.<\/p>/);
  });

  it("is enabled with no reason, and says the busy label while submitting", () => {
    expect(html(E.submit("Save draft", {}))).not.toContain('disabled=""');
    expect(html(E.submit("Save draft", { reason: null }))).not.toContain("aria-describedby");
    expect(html(E.submit("Create transfer", { submitting: true, busy: "Creating…" }))).toMatch(/disabled=""[^>]*>Creating…</);
  });
});

describe("E.pick and E.searchPick empty", () => {
  const empty = { text: "No vendors yet.", label: "Add a vendor", href: "/vendors", to: "Vendors" };

  it("says so and links to where the record is made when only the placeholder is offered", () => {
    const markup = html(E.pick("Vendor", "", [{ value: "", label: "Select vendor" }], { id: "v", empty }));
    expect(markup).toContain("No vendors yet.");
    const link = markup.match(/<a [^>]*>Add a vendor<\/a>/)?.[0];
    expect(link).toContain('href="/vendors"');
    expect(link).toContain('data-to="Vendors"');
    expect(markup).toMatch(/aria-describedby="v-empty"/);
  });

  it("says nothing when there are real options", () => {
    expect(html(E.pick("Vendor", "", [{ value: "", label: "Select vendor" }, { value: "a", label: "Acme" }], { empty }))).not.toContain("No vendors yet.");
  });

  it("an inventory link stays inert", () => {
    expect(html(E.pick("Vendor", "", [], { empty: { ...empty, href: undefined } }))).toMatch(/href="#"/);
  });

  it("searchPick shows the same note outside its trigger", () => {
    const markup = html(E.searchPick("Material", "", [], { empty: { text: "No materials yet.", label: "Add a material", href: "/materials" } }));
    expect(markup).toContain("No materials yet.");
    expect(markup).toMatch(/href="\/materials"/);
  });
});

describe("field error", () => {
  it("E.edit marks the field and links its message", () => {
    for (const type of ["text", "number"]) {
      const markup = html(E.edit("Unit cost", "-3", type, undefined, { id: "cost", onChange: () => {}, error: "Enter a cost of zero or more." }));
      expect(markup).toMatch(/aria-invalid="true"/);
      expect(markup).toMatch(/aria-describedby="cost-error"/);
      expect(markup).toMatch(/id="cost-error"[^>]*>Enter a cost of zero or more\.</);
      expect(markup).not.toMatch(/ error="/);
    }
  });

  it("E.pick and E.qty mark the field and link their message", () => {
    const pick = html(E.pick("Customer", "", ["a"], { id: "c", error: "Choose a customer." }));
    expect(pick).toMatch(/aria-invalid="true"/);
    expect(pick).toMatch(/aria-describedby="c-error"/);
    expect(pick).toContain("Choose a customer.");
    const qty = html(E.qty("-1", "bbl", "Quantity", "q", { error: "Enter a quantity above zero." }));
    expect(qty).toMatch(/aria-invalid="true"/);
    expect(qty).toMatch(/aria-describedby="q-error"/);
    expect(qty).toContain("Enter a quantity above zero.");
  });

  it("no error, no marking", () => {
    expect(html(E.edit("Unit cost", "3", "text", undefined, { id: "cost" }))).not.toMatch(/aria-invalid="|cost-error/);
  });
});
