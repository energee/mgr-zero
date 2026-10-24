// tests/form-feedback.test.ts — the three shared form-feedback primitives:
// a withheld submit names what is missing (#1122, #1128), an empty picker says
// where to add the record (#1123), and a bad value is marked at its field
// (#1121). Pure reason builders first, then the E controls' aria wiring.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { E } from "@/components/mgr/e";
import { submitReason } from "@/lib/mgr/submit-reason";
import { draftLineErrors, orderFormReadiness, orderLineError, orderLineErrors } from "@/lib/order-form-rules";
import { scheduleBatchReason } from "@/lib/mgr/schedule-batch-view";
import { newPoReason, poLineErrors } from "@/lib/mgr/new-po-view";
import { newTransferReason, transferPayloadLines } from "@/lib/mgr/new-transfer-view";
import { withoutLine } from "@/lib/mgr/touched-lines";
import { PrintButton } from "@/app/(app)/pick/print-button";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { NewTransferView } from "@/components/mgr/views/new-transfer";
import { NewPoForm } from "@/app/(app)/purchase-orders/new-po-form";
import { ReplenishForm } from "@/app/(app)/replenishment/replenish-form";
import { RepackView } from "@/components/mgr/views/repack";
import { repackCase } from "@/lib/mgr/fixtures/packaging";
import { NewOrderView } from "@/components/mgr/views/new-order";
import { newOrderDraft } from "@/lib/mgr/fixtures/orders";
import { toNewOrderViewProps } from "@/lib/mgr/new-order-view";
import { routeReason } from "@/lib/mgr/route-view";
import { repackReason } from "@/lib/mgr/repack-view";
import { replenishmentQuantityReason, replenishReason } from "@/lib/replenishment-form";
import { pickSheetPrintReason } from "@/lib/mgr/pick-sheet-view";
import { vesselCapacityError, vesselReason } from "@/lib/mgr/vessel-detail-view";
import { VesselDetailView } from "@/components/mgr/views/vessel-detail";
import { VesselForm } from "@/app/(app)/batches/vessel-form";
import { vesselFv3 } from "@/lib/mgr/fixtures/production";
import { ContractView } from "@/components/mgr/views/contract";
import { contractYchCitra } from "@/lib/mgr/fixtures/purchasing";

// The live forms render without a router or a command round trip.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/commands/use-command-form", () => ({
  useCommandAction: () => ({ busy: false, error: null, run: () => {} }),
  useCommandForm: () => ({ open: true, setOpen: () => {}, submit: () => {}, submitting: false, error: null }),
}));

const html = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("submitReason", () => {
  it("names what is missing as one sentence, or null when nothing is", () => {
    expect(submitReason([])).toBeNull();
    expect(submitReason(["a vendor"])).toBe("Still needed: a vendor.");
    expect(submitReason(["a vendor", "a quantity"])).toBe("Still needed: a vendor and a quantity.");
  });

  it("is the conjunction the order hint already used", () => {
    const hint = orderFormReadiness({ kind: "wholesale", customerId: "", shipToId: "", fromLocationId: "", toLocationId: "", lines: [], catalog: { customers: 0, locations: 0, skus: 0 } }).hint;
    expect(hint).toBe("Before creating an order, add a customer, a location, and a SKU.");
  });
});

describe("per-form reasons", () => {
  it("Schedule batch needs a date and planned barrels above zero", () => {
    expect(scheduleBatchReason({ date: "", plannedBbl: "" })).toBe("Still needed: a date and planned barrels above zero.");
    expect(scheduleBatchReason({ date: "2026-10-22", plannedBbl: "-1" })).toBe("Still needed: planned barrels above zero.");
    expect(scheduleBatchReason({ date: "2026-10-22", plannedBbl: "1.5" })).toBeNull();
  });

  it("New PO needs a vendor and, on each line, a material, a quantity above zero and no negative cost", () => {
    expect(newPoReason({ vendor: "", lines: [{ materialId: "", qty: "", cost: "" }] }))
      .toBe("Still needed: a vendor, a material on each line, and a quantity above zero on each line.");
    expect(newPoReason({ vendor: "v", lines: [{ materialId: "m", qty: "0.5", cost: "" }] })).toBeNull();
    expect(newPoReason({ vendor: "v", lines: [{ materialId: "m", qty: "4", cost: "-3" }] })).toBe("Still needed: a unit cost of zero or more.");
  });

  it("New PO marks a bad quantity or cost on its own field, never a blank one", () => {
    expect(poLineErrors({ qty: "", cost: "" })).toEqual({});
    expect(poLineErrors({ qty: "-4", cost: "-3" })).toEqual({ qty: "Enter a quantity above zero.", cost: "Enter a cost of zero or more." });
    expect(poLineErrors({ qty: 0.5, cost: "0" })).toEqual({});
  });

  it("New transfer needs both ends and a complete line, and refuses an entered line it cannot send", () => {
    const ends = { fromId: "a", toId: "b", fromBinId: "a1", toBinId: "b1" };
    expect(newTransferReason({ fromId: "", toId: "", fromBinId: "", toBinId: "", lines: [{ skuId: "", qty: "" }] }))
      .toBe("Still needed: a From location, a To location, and a SKU with a quantity above zero on each line.");
    // The form picks a location's first bin, so a missing bin means the location has none.
    expect(newTransferReason({ ...ends, toBinId: "", lines: [{ skuId: "s", qty: "2" }] })).toBe("Still needed: a To location that has a bin.");
    expect(newTransferReason({ ...ends, toId: "a", lines: [{ skuId: "s", qty: "2" }] })).toBe("Still needed: a To location other than the From location.");
    expect(newTransferReason({ ...ends, lines: [{ skuId: "s", qty: "2" }, { skuId: "", qty: "" }] })).toBeNull();
    // A typed line that cannot be sent blocks the save instead of being dropped (#1121).
    expect(newTransferReason({ ...ends, lines: [{ skuId: "s", qty: "2" }, { skuId: "t", qty: "-2" }] })).toBe("Still needed: a SKU with a quantity above zero on each line.");
  });

  it("the transfer payload keeps every entered line, even one that cannot be sent, and drops only blank spare rows", () => {
    expect(transferPayloadLines([{ skuId: "s", qty: "2" }, { skuId: "", qty: "" }, { skuId: "t", qty: "-2" }], "a1", "b1")).toEqual([
      { skuId: "s", qty: 2, fromBinId: "a1", toBinId: "b1" },
      { skuId: "t", qty: -2, fromBinId: "a1", toBinId: "b1" },
    ]);
  });

  it("each order or transfer line marks the field that is wrong: the SKU, the quantity, or both", () => {
    expect(orderLineError({ skuId: "s", qty: "2" }, 0, 3)).toEqual({});
    expect(orderLineError({ skuId: "", qty: "" }, 2, 3)).toEqual({});
    expect(orderLineError({ skuId: "s", qty: "" }, 1, 3)).toEqual({ qty: "Line 2: enter a quantity greater than zero, or remove the line." });
    expect(orderLineError({ skuId: "", qty: "2" }, 1, 3)).toEqual({ sku: "Line 2: select a SKU, or remove the line." });
    expect(orderLineError({ skuId: "", qty: "-2" }, 0, 1)).toEqual({ sku: "Line 1: select a SKU.", qty: "Line 1: enter a quantity greater than zero." });
    expect(orderLineErrors([{ skuId: "s", qty: "2" }, { skuId: "", qty: "-2" }])).toEqual(["Line 2: select a SKU, or remove the line.", "Line 2: enter a quantity greater than zero, or remove the line."]);
  });

  it("New order names what Save draft still needs", () => {
    const base = { kind: "wholesale" as const, customerId: "c", shipToId: "st", fromLocationId: "l", toLocationId: "", lines: [{ skuId: "s", qty: "2" }], availableSkuIds: ["s"], catalog: { customers: 1, locations: 1, skus: 1 } };
    expect(orderFormReadiness(base)).toEqual({ submittable: true, reason: null, hint: null, goTo: [] });
    expect(orderFormReadiness({ ...base, customerId: "", shipToId: "", fromLocationId: "", lines: [{ skuId: "", qty: "" }] }).reason)
      .toBe("Still needed: a customer, a source location, and a SKU with a quantity above zero on each line.");
    expect(orderFormReadiness({ ...base, shipToId: "" }).reason).toBe("Still needed: a ship-to.");
    expect(orderFormReadiness({ ...base, kind: "taproom_transfer" }).reason).toBe("Still needed: a destination location.");
    expect(orderFormReadiness({ ...base, lines: [{ skuId: "gone", qty: "2" }] })).toMatchObject({ submittable: false, reason: "Still needed: an available SKU on each line." });
  });

  it("Edit draft marks the SKU or the quantity of each line it cannot save", () => {
    expect(draftLineErrors([{ skuId: "a", qty: "2" }], ["a"])).toEqual([{}]);
    expect(draftLineErrors([{ skuId: "gone", qty: "0" }], ["a"])).toEqual([{ sku: "Line 1: choose an available SKU.", qty: "Line 1: enter a quantity of at least 0.01." }]);
    expect(draftLineErrors([{ skuId: "a", qty: "2" }, { skuId: "a", qty: "3" }], ["a"])[1])
      .toEqual({ sku: "Line 2: this SKU is already on another line. Combine its quantities or remove this line." });
  });

  it("a removed line takes its touched mark with it, and later lines move up", () => {
    expect([...withoutLine(new Set([0, 1, 3]), 1)]).toEqual([0, 2]);
  });

  it("Route needs a delivery date and a stop", () => {
    expect(routeReason({ date: "", selection: {} })).toBe("Still needed: a delivery date and a stop.");
    expect(routeReason({ date: "2026-10-22", selection: { o: 1 } })).toBeNull();
  });

  it("Repack needs a SKU to break, a location, a bin and a quantity above zero", () => {
    expect(repackReason({ parentSkuId: "", locationId: "", binId: "", qty: "" })).toBe("Still needed: a SKU to break, a location, a bin, and a quantity above zero.");
    expect(repackReason({ parentSkuId: "p", locationId: "l", binId: "b", qty: "2" })).toBeNull();
  });

  it("par and standing allocation need a SKU and a quantity of zero or more", () => {
    expect(replenishmentQuantityReason("sku", "0")).toBeNull();
    expect(replenishmentQuantityReason("sku", "2.5")).toBeNull();
    for (const qty of ["", " ", "-1", "NaN", "Infinity"]) expect(replenishmentQuantityReason("sku", qty)).toBe("Still needed: a quantity of zero or more.");
    expect(replenishmentQuantityReason("", "1")).toBe("Still needed: a SKU.");
  });

  it("a replenishment order needs a source warehouse and a positive line", () => {
    expect(replenishReason("", [])).toBe("Still needed: a warehouse to send from and a transfer quantity above zero.");
    expect(replenishReason("w", [{ skuId: "s", qty: 1 }])).toBeNull();
  });

  it("Save vessel needs a name and a capacity above zero (#1116)", () => {
    expect(vesselReason({ name: " ", capacity: "" })).toBe("Still needed: a name and a valid capacity.");
    expect(vesselReason({ name: "FV9", capacity: "0" })).toBe("Still needed: a valid capacity.");
    expect(vesselReason({ name: "FV9", capacity: "15.5" })).toBeNull();
  });

  it("Vessel capacity marks a typed value that is not above zero, never a blank one (#1116)", () => {
    expect(vesselCapacityError("")).toBeUndefined();
    for (const capacity of ["0", "-2", "0.0001"]) expect(vesselCapacityError(capacity)).toBe("Capacity must be at least 0.001 bbl.");
    expect(vesselCapacityError("abc")).toBe("Enter a valid capacity in bbl.");
    expect(vesselCapacityError("0.5")).toBeUndefined();
  });

  it("Pick sheet print is withheld while the sheet is empty (#1128)", () => {
    expect(pickSheetPrintReason({ groups: [], empty: { title: "Nothing confirmed to pick", description: "" } })).toBe("Nothing to print yet.");
    expect(pickSheetPrintReason({ groups: [{ key: "d", title: "d", rows: [], totals: [] }] })).toBeNull();
  });
});

describe("E.submit", () => {
  it("withholds the button and ties the visible reason to it", () => {
    const markup = html(E.submit("Save draft", { reason: "Still needed: a vendor.", id: "po-save" }));
    expect(markup).toMatch(/<button[^>]*id="po-save"[^>]*disabled=""/);
    expect(markup).toMatch(/aria-describedby="po-save-reason"/);
    expect(markup).toMatch(/<p id="po-save-reason"[^>]*>Still needed: a vendor\.<\/p>/);
  });

  it("is enabled with no reason, and says the busy label while submitting", () => {
    expect(html(E.submit("Save draft", {}))).not.toContain('disabled=""');
    expect(html(E.submit("Save draft", { reason: null }))).not.toContain("aria-describedby");
    expect(html(E.submit("Create transfer", { submitting: true, busy: "Creating…" }))).toMatch(/disabled=""[^>]*>Creating…</);
  });
});

describe("other withheld buttons", () => {
  it("Print is a plain button, withheld with its reason linked (#1128)", () => {
    const markup = html(createElement(PrintButton, { reason: "Nothing to print yet." }));
    const id = markup.match(/<p id="([^"]+)"[^>]*>Nothing to print yet\.<\/p>/)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toMatch(new RegExp(`<button[^>]*type="button"[^>]*disabled=""[^>]*aria-describedby="${id}"`));
    expect(html(createElement(PrintButton, { reason: null }))).not.toContain('disabled=""');
  });

  it("an irreversible submit prints its reason too", () => {
    const markup = html(createElement(IrreversibleSubmit, { label: "Confirm repack", reason: "Still needed: a bin." }));
    expect(markup).toContain("Still needed: a bin.");
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-describedby="[^"]+-reason"/);
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

  it("searchPick with no options never says no match, even without a note", () => {
    const markup = html(E.searchPick("Material", "", [], { id: "m" }));
    expect(markup).not.toContain("No matching");
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

  it("a date links its message from the picker", () => {
    const markup = html(E.edit("Expected", "", "date", undefined, { id: "d", onChange: () => {}, error: "Enter a date." }));
    expect(markup).toMatch(/aria-describedby="d-error"/);
    expect(markup).toMatch(/id="d-error"[^>]*>Enter a date\.</);
  });

  it("no error, no marking", () => {
    expect(html(E.edit("Unit cost", "3", "text", undefined, { id: "cost" }))).not.toMatch(/aria-invalid="|cost-error/);
  });
});

describe("line errors in the views", () => {
  const transfer = { from: "Brewery", fromOptions: ["Brewery"], fromBin: "Cold", fromBinOptions: ["Cold"], to: "Taproom", toOptions: ["Taproom"], toBin: "Walk-in", toBinOptions: ["Walk-in"], skuOptions: [], lines: [{ sku: "", title: "", qty: "2" }] };

  it("a drawn transfer line with a quantity and no SKU marks the SKU, not the quantity, with the message under the row", () => {
    const markup = html(createElement(NewTransferView, { model: transfer }));
    expect(markup).toMatch(/aria-label="Line 1 SKU"(?=[^>]*aria-invalid="true")(?=[^>]*aria-describedby="[^"]*-0-sku-error\b)/);
    expect(markup).toMatch(/aria-label="Line 1 qty"(?![^>]*aria-invalid="true")/);
    expect(markup).toMatch(/id="[^"]*-0-sku-error"[^>]*>Line 1: select a SKU\.</);
  });

  it("a drawn order line marks both its SKU picker and its quantity, each linked to its own message", () => {
    const model = { ...toNewOrderViewProps(newOrderDraft), lines: [{ name: "", skuId: "", qty: "-2", warning: false }] };
    const markup = html(createElement(NewOrderView, { model }));
    expect(markup).toMatch(/aria-label="Line 1 SKU"[^>]*aria-describedby="[^"]*-line-0-sku-error"[^>]*aria-invalid="true"/);
    expect(markup).toMatch(/aria-label="Line 1 quantity"[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]*-line-0-qty-error"/);
    expect(markup).toMatch(/id="[^"]*-line-0-sku-error"[^>]*>Line 1: select a SKU\.</);
    expect(markup).toMatch(/id="[^"]*-line-0-qty-error"[^>]*>Line 1: enter a quantity greater than zero\.</);
  });

  it("the Customer picker's empty note is tied to it", () => {
    const markup = html(createElement(NewOrderView, { model: { ...toNewOrderViewProps(newOrderDraft), customer: "", customers: [] } }));
    const emptyId = markup.match(/<p[^>]*id="([^"]+-empty)"[^>]*>No customers yet\./)?.[1];
    expect(emptyId).toBeTruthy();
    expect(markup).toMatch(new RegExp(`aria-describedby="${emptyId}"`));
  });

  it("a live line waits for the user to leave its quantity before it shows an error", () => {
    const markup = html(createElement(NewTransferView, { model: transfer, controls: { lineQty: () => {} } }));
    expect(markup).not.toContain("Line 1: select a SKU.");
    expect(markup).not.toContain('aria-invalid="true"');
  });

  it.each(["wholesale", "taproom_transfer"] as const)("a live %s order waits for line interaction before marking either field", kind => {
    const model = { ...toNewOrderViewProps(newOrderDraft), kind, lines: [{ name: "", skuId: "", qty: "-2", warning: false }] };
    const markup = html(createElement(NewOrderView, { model, controls: { lineQty: () => {} } }));
    expect(markup).not.toMatch(/Line 1:|aria-invalid="true"/);
  });

  it("a drawn vessel capacity of 0 is marked at the field; a live one waits for the user to leave it (#1116)", () => {
    const drawn = html(createElement(VesselDetailView, { model: { ...vesselFv3, capacity: "0" } }));
    const errorId = drawn.match(/id="([^"]+-error)"[^>]*>Capacity must be at least 0\.001 bbl\.</)?.[1];
    expect(errorId).toBeTruthy();
    expect(drawn).toMatch(new RegExp(`aria-describedby="${errorId}"`));
    expect(html(createElement(VesselDetailView, { model: { ...vesselFv3, capacity: "0" }, onCapacity: () => {} }))).not.toContain("Capacity must be at least 0.001 bbl.");
  });

  it("an empty picker names who adds the record when this user cannot", () => {
    const own = html(createElement(NewTransferView, { model: { ...transfer, skusHref: "/catalog" } }));
    expect(own).toMatch(/<a [^>]*href="\/catalog"[^>]*>Add a SKU<\/a>/);
    const other = html(createElement(NewTransferView, { model: { ...transfer, skusHref: null } }));
    expect(other).toContain("No SKUs yet. An admin or sales member adds them in Catalog.");
    expect(other).not.toContain("Add a SKU");
  });

  it("New contract's empty Vendor picker points at Add vendor on its page, its empty Material picker links Materials; each note is tied to its picker (#1123)", () => {
    const markup = html(createElement(ContractView, { model: { ...contractYchCitra, vendorId: "", vendorOptions: [], materialId: "", materialOptions: [] } }));
    const vendorEmpty = markup.match(/<p[^>]*id="([^"]+-empty)"[^>]*>No vendors yet\. Close this form and choose Add vendor\.<\/p>/)?.[1];
    const materialEmpty = markup.match(/<p[^>]*id="([^"]+-empty)"[^>]*>No materials yet\./)?.[1];
    expect(vendorEmpty).toBeTruthy();
    expect(materialEmpty).toBeTruthy();
    expect(markup).toMatch(new RegExp(`aria-describedby="${vendorEmpty}"`));
    expect(markup).toMatch(new RegExp(`aria-describedby="${materialEmpty}"`));
    const link = markup.match(/<a [^>]*>Add a material<\/a>/)?.[0];
    expect(link).toContain('href="/materials"');
    expect(link).toContain('data-to="Materials on hand"');
    expect(html(createElement(ContractView, { model: contractYchCitra }))).not.toMatch(/No vendors yet|No materials yet/);
  });

  it("a chosen location with no bins says so under its bin picker", () => {
    const markup = html(createElement(NewTransferView, { model: { ...transfer, fromBin: "", fromBinOptions: [] } }));
    expect(markup).toContain("This location has no bins.");
    expect(markup).toMatch(/<a [^>]*>Open Locations<\/a>/);
  });

  it("Repack Break links Catalog for a user who can set a format's contents, and names the role otherwise; the note is tied to the picker", () => {
    const model = { ...repackCase, parents: [], locations: [], parentSkuId: "", locationId: "", binId: "" };
    const own = html(createElement(RepackView, { model: { ...model, formatsHref: "/catalog" } }));
    expect(own).toMatch(/<a [^>]*href="\/catalog"[^>]*>Open Catalog<\/a>/);
    const emptyId = own.match(/<p[^>]*id="([^"]+-empty)"[^>]*>No SKU can be broken yet/)?.[1];
    expect(emptyId).toBeTruthy();
    expect(own).toMatch(new RegExp(`aria-describedby="${emptyId}"`));
    const other = html(createElement(RepackView, { model: { ...model, formatsHref: null } }));
    expect(other).toContain("An admin or sales member sets a format&#x27;s contents in Catalog.");
    expect(other).not.toContain("Open Catalog");
  });
});

describe("live forms withhold their submit with the reason", () => {
  const withheld = (markup: string, reason: string) => {
    const id = markup.match(new RegExp(`<p id="([^"]+)"[^>]*>${reason.replace(/[.]/g, "\\.")}</p>`))?.[1];
    expect(id).toBeTruthy();
    expect(markup).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-describedby="${id}"`));
  };

  it("New PO, before anything is chosen", () => {
    withheld(html(createElement(NewPoForm, { vendors: [], materials: [] })), "Still needed: a vendor, a material on each line, and a quantity above zero on each line.");
  });

  it("New vessel, with no name or capacity (#1116)", () => {
    const model = { title: "New vessel", name: "", type: "Fermenter", typeOptions: ["Fermenter"], capacity: "" };
    withheld(html(createElement(VesselForm, { model })), "Still needed: a name and a valid capacity.");
  });

  it("Create replenishment order, with no warehouse and no lines", () => {
    withheld(html(createElement(ReplenishForm, {
      model: { locationId: "t", locationName: "Taproom", locations: [{ value: "t", label: "Taproom" }], warehouses: [], suggestions: [], allocations: [], shortfalls: [], canEdit: true },
      skus: [],
      workHrefs: {},
    })), "Still needed: a warehouse to send from and a transfer quantity above zero.");
  });
});
