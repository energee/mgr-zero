// tests/order-sheets-view.test.ts — Adjust / Short pick / Pick / Ship /
// Shipment done / Return share one drawing each with their live sheets.
// Fixtures are get_order snapshots painted by the adapters.
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PickView } from "../components/mgr/views/pick";
import { ReturnCreditView, ReturnSourcesView } from "../components/mgr/views/return-credit";
import { ShipView } from "../components/mgr/views/ship";
import { ShipmentDoneView } from "../components/mgr/views/shipment-done";
import { ShortPickView } from "../components/mgr/views/short-pick";
import { CompleteTransferView } from "../components/mgr/views/complete-transfer";
import { orderTransferComplete } from "../lib/mgr/fixtures/orders";
import { toCompleteTransferViewProps } from "../lib/mgr/complete-transfer-view";
import {
  orderPick,
  orderReturnCredit,
  orderShipInvoice,
  orderShipOnDelivery,
  orderShipmentDone,
  orderShortPick,
} from "../lib/mgr/fixtures/order-sheets";
import { toPickViewProps } from "../lib/mgr/pick-view";
import { numberNotationError } from "../lib/mgr/quantity-input";
import { returnCreditReason, returnQuantityError, toReturnCreditViewProps } from "../lib/mgr/return-credit-view";
import { toShipViewProps } from "../lib/mgr/ship-view";
import { toShipmentDoneViewProps } from "../lib/mgr/shipment-done-view";
import { toShortPickViewProps } from "../lib/mgr/short-pick-view";

const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);

it("leaves unspecified return-source quantities blank", () => {
  const markup = html(createElement(ReturnSourcesView, { groups: [{ key: "sku", name: "Pils", sources: [{ id: "source", label: "Shelf", shipped: 5 }] }] }));
  expect(markup).toContain('value=""');
  expect(markup).not.toContain('value="0"');
});

describe("Short pick view", () => {
  it("does not infer a unit from a SKU name", () => {
    const model = toShortPickViewProps({ ...orderShortPick, line: { ...orderShortPick.line, unit: undefined, skus: { name: "Showcase" } } });
    expect(model.verb).toBe("Adjust order to 7");
  });
  it("maps the short Pils line onto the adjust-down verb", () => {
    const model = toShortPickViewProps(orderShortPick);
    expect(model.title).toBe("ORD-0231 · short line");
    expect(model.source).toBe("Ridgeline Tap Room · Warehouse");
    expect(model.counted).toBe(7);
    expect(model.missing).toBe(3);
    expect(model.resolveTitle).toBe("Resolve the missing 3");
    expect(model.verb).toBe("Adjust order to 7 cases");
  });

  it("the drawing still shows the preview arrow and Adjust order to 7 cases", () => {
    const markup = html(createElement(ShortPickView, { model: toShortPickViewProps(orderShortPick) }));
    // The sheet carries the title; the body draws no back link to Pick.
    expect(markup).not.toMatch(/ORD-0231 · short line/);
    expect(markup).not.toMatch(/<a /);
    expect(markup).toMatch(/Ridgeline Tap Room · Warehouse/);
    expect(markup).toMatch(/ordered 10/);
    expect(markup).toMatch(/Reason/);
    expect(markup).toMatch(/required/);
    expect(markup).toMatch(/Resolve the missing 3/);
    expect(markup).toMatch(/>Adjust order to 7 cases</);
    expect(markup).toContain('data-direction="forward"');
    expect(markup).not.toMatch(/[→›]/);
  });
});

describe("Pick view", () => {
  it("defaults every line to ordered with ok tone", () => {
    const model = toPickViewProps(orderPick);
    expect(model.backTo).toBe("ORD-0231");
    expect(model.title).toBe("Pick · Warehouse");
    expect(model.subtitle).toBe("Ridgeline Tap Room · ships Sep 10, 2026");
    expect(Object.fromEntries(model.lines.map(l => [l.key, [l.qty, l.tone]]))).toEqual({ "l-hazy": [4, "ok"], "l-pils": [10, "ok"], "l-stout": [2, "ok"] });
  });

  it("groups formats across brands without detaching quantities from their order lines", () => {
    const sku = (brand: string, format: string) => ({ name: `${brand} · ${format}`, brands: { name: brand }, formats: { name: format } });
    const at = (id: string, skus: (typeof orderPick.lines)[number]["skus"], ordered: number, picked: number | null) => ({ id, sku_id: id, qty_ordered: ordered, qty_picked: picked, skus });
    const aliased = { name: "Appaloosa · Case", brands: { name: "Appaloosa", alias: "Animal #14" }, formats: { name: "Case" } };
    const model = toPickViewProps({ ...orderPick, lines: [at("a", sku("Hazy", "Half"), 4, null), at("b", sku("Pils", "Case"), 10, 7), at("c", aliased, 2, null)] });
    expect(model.lines.map((l) => [l.key, l.group, l.name, l.ordered, l.qty, l.tone])).toEqual([
      ["c", "Case", "Appaloosa · Animal #14", 2, 2, "ok"],
      ["b", "Case", "Pils", 10, 7, "w"],
      ["a", "Half", "Hazy", 4, 4, "ok"],
    ]);
    const cells = html(createElement(PickView, { model })).match(/<tr[\s\S]*?<\/tr>/g)!.slice(1).map((r) => r.match(/<td[^>]*>([\s\S]*?)<\/td>/)![1].replace(/<[^>]+>/g, ""));
    expect(cells).toEqual(["Case", "", "Half"]);
  });

  it("caps each pick field at the ordered quantity (#471)", () => {
    const model = toPickViewProps(orderPick);
    const markup = html(createElement(PickView, { model }));
    expect(markup.match(/max="(\d+)"/g)?.toSorted()).toEqual(['max="10"', 'max="2"', 'max="4"']);
  });

  // Hazy is ordered 5 here; each typed count is judged against it (#1484).
  const hazy = { ...orderPick.lines[0], qty_ordered: 5 };
  const counted = (count: string) => toPickViewProps({ ...orderPick, lines: [hazy] }, { [hazy.id]: count });

  it("names a count outside 0 to ordered and withholds Done picking (#1484)", () => {
    for (const count of ["-1", "6", "", "1e1"]) {
      const model = counted(count);
      expect(model.lines[0].error, count).toBe(count === "1e1" ? numberNotationError(count) : "Enter a count from 0 to 5.");
      expect(model.lines[0].tone, count).not.toBe("w");
      expect(model.reason, count).toBe("Still needed: a count from 0 to the ordered quantity on every line.");
    }
    for (const count of ["0", "5"]) {
      expect(counted(count).lines[0].error, count).toBeUndefined();
      expect(counted(count).reason, count).toBeNull();
    }
    expect(counted("3").lines[0].tone).toBe("w");
  });

  it("draws the count error under the field and the reason beside a disabled Done picking (#1484)", () => {
    const markup = html(createElement(PickView, { model: counted("-1"), quantities: { [hazy.id]: "-1" }, onQuantity: () => {} }));
    expect(markup).toContain("Enter a count from 0 to 5.");
    expect(markup).toContain("Still needed: a count from 0 to the ordered quantity on every line.");
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    expect(markup).not.toContain(">Short<");
  });

  it("keeps the ordered prefill and says when the source holds less (#1484)", () => {
    const [h, p, s] = orderPick.lines;
    const model = toPickViewProps({ ...orderPick, sourceOnHand: [{ sku_id: h.sku_id, qty: 3 }, { sku_id: p.sku_id, qty: 10 }] });
    expect(Object.fromEntries(model.lines.map(l => [l.key, [l.qty, l.available]]))).toEqual({
      [h.id]: [4, "Only 3 available"], [p.id]: [10, undefined], [s.id]: [2, "Only 0 available"],
    });
    expect(html(createElement(PickView, { model }))).toContain("Only 3 available");
    expect(toPickViewProps(orderPick).lines.every(l => l.available === undefined)).toBe(true);
  });
});

describe("Ship view", () => {
  it("preserves exact SKU names without inventing units or barrel volumes", () => {
    const model = toShipViewProps({ ...orderShipOnDelivery, lines: [{ ...orderShipOnDelivery.lines[0], skus: { name: "Hazy special can" }, bbl_per_unit: undefined }] });
    expect(model.tape[0][0]).toContain("−4 Hazy special can");
    expect(model.tape[0][0]).not.toContain("bbl");
    expect(model.tape[0][1]).toBe("");
  });
  it("does not invent a destination code for an empty ship-to state", () => {
    const model = toShipViewProps({
      ...orderShipOnDelivery,
      order: { ...orderShipOnDelivery.order, ship_tos: { state: "" } },
      lines: [{ ...orderShipOnDelivery.lines[0], skus: { name: "Sample keg" } }],
    });
    expect(model.tape[0][0]).not.toMatch(/\b[A-Z]{2}\b/);
  });
  it("names every held-back line on the restock preview", () => {
    const model = toShipViewProps({ ...orderShipInvoice, lines: orderShipInvoice.lines.map(line => ({ ...line, qty_shipped: 0 })) });
    expect(model.tape.filter(row => row[0].includes("released · restock"))).toHaveLength(2);
  });
  it("maps a short Pils ship onto reason, restock tape, and invoice-now", () => {
    const model = toShipViewProps(orderShipInvoice);
    expect(model.title).toBe("Ship");
    expect(model.fulfillmentSource).toBe("Warehouse");
    expect(model.lines[1]).toMatchObject({ qty: 9, tone: "w", detail: "ordered 10 · picked 10" });
    expect(model.shortNote).toMatch(/Shipping 9 of 10 Pils/);
    expect(model.tape).toEqual([
      ["−4 Hazy IPA · ½ bbl keg · removed for sale · ships to PA", "2.00 bbl"],
      ["−9 Pils · 16 oz case · removed for sale · ships to PA", "0.87 bbl"],
      ["1 Pils · 16 oz case released · restock", ""],
      ["invoice number", "assigned on commit"],
    ]);
  });

  it("the invoice-now drawing still shows Reason required and Ship order", () => {
    const markup = html(createElement(ShipView, {
      model: toShipViewProps(orderShipInvoice),
    }));
    expect(markup).toMatch(/ORD-0231/);
    // The ship-from location reads as text, not a disabled one-option select (#1504).
    expect(markup).toMatch(/<dt[^>]*>Fulfillment source<\/dt>/);
    expect(markup).not.toMatch(/data-disabled="true"/);
    expect(markup).toMatch(/Reason/);
    expect(markup).toMatch(/required/);
    expect(markup).toMatch(/Shipping 9 of 10 Pils/);
    expect(markup).toMatch(/Carrier/);
    expect(markup).toMatch(/Invoice now/);
    expect(markup).toMatch(/On delivery/);
    expect(markup).toMatch(/2\.00 bbl/);
    expect(markup).toMatch(/0\.87 bbl/);
    expect(markup).toMatch(/>Ship order</);
    expect(markup).toContain('data-variant="irreversible"');
  });

  it("shows why Ship order and Complete transfer are disabled (#1385)", () => {
    const reason = "Still needed: a source bin and lot for Hazy IPA.";
    for (const node of [
      createElement(ShipView, { model: toShipViewProps(orderShipOnDelivery), reason }),
      createElement(CompleteTransferView, { model: toCompleteTransferViewProps(orderTransferComplete), reason }),
    ]) {
      const markup = html(node);
      expect(markup).toContain(reason);
      expect(markup).toMatch(/<button[^>]*disabled=""/);
      const description = markup.match(/<button[^>]*aria-describedby="([^"]+)"/)?.[1];
      expect(description).toBeTruthy();
      expect(markup).toContain(`id="${description}"`);
    }
  });

  it("asks each short line for its reason, prefilled from the stored one (#624)", () => {
    const lines = orderShipInvoice.lines.map(line => line.id === "l-pils" ? { ...line, short_reason: "short in pick face" } : line);
    const model = toShipViewProps({ ...orderShipInvoice, lines });
    expect(model.lines.map(line => line.shortReason)).toEqual([undefined, "short in pick face"]);
    const markup = html(createElement(ShipView, { model }));
    expect(markup).toContain('aria-label="Pils · 16 oz case shortage reason"');
    expect(markup).toContain('value="short in pick face"');
    expect(markup).not.toContain("Hazy IPA · ½ bbl keg shortage reason");
    expect(html(createElement(ShipView, { model: toShipViewProps(orderShipOnDelivery) }))).not.toMatch(/shortage reason/);
  });

  it("a pickup order is invoiced now: no On delivery choice, even if one was asked for", () => {
    const pickup = { ...orderShipOnDelivery, order: { ...orderShipOnDelivery.order, pickup: true } };
    const model = toShipViewProps(pickup);
    expect(model.pickup).toBe(true);
    expect(model.invoiceTiming).toBe("now");
    expect(model.tape.at(-1)).toEqual(["invoice number", "assigned on commit"]);
    const markup = html(createElement(ShipView, { model }));
    expect(markup).toMatch(/Invoice now/);
    expect(markup).not.toMatch(/On delivery/);
    expect(markup).toContain("A pickup order is invoiced when it ships.");
    const delivered = html(createElement(ShipView, { model: toShipViewProps(orderShipOnDelivery) }));
    expect(toShipViewProps(orderShipOnDelivery).pickup).toBe(false);
    expect(delivered).toMatch(/On delivery/);
    expect(delivered).not.toContain("pickup order");
  });

  it("maps all-as-picked onto deferred invoice tape", () => {
    const model = toShipViewProps(orderShipOnDelivery);
    expect(model.invoiceTiming).toBe("on_delivery");
    expect(model.shortNote).toBeUndefined();
    expect(model.lines.map((l) => [l.qty, l.detail, l.tone])).toEqual([
      [4, "picked 4", "ok"],
      [10, "picked 10", "ok"],
    ]);
    expect(model.tape).toEqual([
      ["−4 Hazy IPA · ½ bbl keg · removed for sale · ships to PA", "2.00 bbl"],
      ["−10 Pils · 16 oz case · removed for sale · ships to PA", "0.97 bbl"],
      ["invoice number", "deferred to delivery"],
    ]);
  });

  it("On delivery is the same ShipView with chips index 1", () => {
    const markup = html(createElement(ShipView, {
      model: toShipViewProps(orderShipOnDelivery),
      invoiceTiming: 1,
    }));
    expect(markup).toMatch(/picked 10/);
    expect(markup).toMatch(/On delivery/);
    expect(markup).toMatch(/deferred to delivery/);
    expect(markup).toMatch(/0\.97 bbl/);
    expect(markup).toMatch(/>Ship order</);
    expect(markup).not.toMatch(/Reason/);
    expect(markup).not.toMatch(/[→›]/);
  });
});

describe("Shipment done view", () => {
  it("names the shipping destination only when supplied, preserving shortage notes", () => {
    const destination = { ...orderShipmentDone, order: { ...orderShipmentDone.order, ship_tos: { state: "NY" } } };
    expect(toShipmentDoneViewProps(destination).tape[0][0]).toContain("NY");
    const model = toShipmentDoneViewProps({
      ...orderShipmentDone,
      order: { ...orderShipmentDone.order, ship_tos: null },
      lines: [{ ...orderShipmentDone.lines[0], skus: { name: "Sample keg" }, short_reason: "one keg dented" }],
    });
    expect(model.tape[0][0]).toContain("one keg dented");
    expect(model.tape[0][0]).not.toMatch(/\b[A-Z]{2}\b/);
  });
  it("#815 shows saved shell shortages without inventing warnings on legacy receipts", () => {
    // Two short pools at one location must read differently: pool and size are named.
    const warnings = [
      { pool: "Owned", keg_size: "half_bbl", location: "Warehouse", short: 2 },
      { pool: "Kegline", keg_size: "sixth_bbl", location: "Warehouse", short: 2 },
    ];
    const model = toShipmentDoneViewProps({ ...orderShipmentDone, warnings });
    expect(model.warnings).toEqual([
      "Owned ½ bbl · Warehouse: 2 kegs short · record Acquired kegs to reconcile",
      "Kegline ⅙ bbl · Warehouse: 2 kegs short · record Acquired kegs to reconcile",
    ]);
    const markup = html(createElement(ShipmentDoneView, { model }));
    for (const warning of model.warnings) expect(markup).toContain(warning);
    expect(toShipmentDoneViewProps({ ...orderShipmentDone, warnings: undefined }).warnings).toEqual([]);
  });
  it("does not claim an invoice when the confirmed shipment has none", () => {
    const model = toShipmentDoneViewProps({ ...orderShipmentDone, invoice: null });
    expect(model.invoice).toBe("No invoice was created");
    expect(model.tape.flat().join(" ")).not.toContain("invoiced now");
  });
  it("names the shortage reason on a line shipped short (#624)", () => {
    const lines = orderShipmentDone.lines.map((l, i) => (i === 0 ? { ...l, short_reason: "one keg dented" } : l));
    const model = toShipmentDoneViewProps({ ...orderShipmentDone, lines });
    expect(model.tape[0][0]).toMatch(/· short: one keg dented$/);
    expect(model.tape[1][0]).not.toMatch(/short:/);
    expect(html(createElement(ShipmentDoneView, { model }))).toContain("short: one keg dented");
  });
  it("maps INV-1042 onto the assigned invoice field", () => {
    const model = toShipmentDoneViewProps(orderShipmentDone);
    expect(model.backTo).toBe("ORD-0231");
    expect(model.title).toBe("Shipped");
    expect(model.invoice).toBe("INV-1042 · assigned");
    expect(model.tape.at(-1)).toEqual(["INV-1042", "invoiced now"]);
  });

  it("offers Add to route only when the caller passes a route link (#1505)", () => {
    const routed = html(createElement(ShipmentDoneView, { model: toShipmentDoneViewProps({ ...orderShipmentDone, routeHref: "/routes/new?add=sh-1" }) }));
    expect(routed).toMatch(/<a\b[^>]*href="\/routes\/new\?add=sh-1"[^>]*>Add to route<\/a>/);
    expect(html(createElement(ShipmentDoneView, { model: toShipmentDoneViewProps({ ...orderShipmentDone, routeHref: undefined }) }))).not.toContain("Add to route");
  });

  it("stays on the result and offers Open order back to the order page (#1489)", () => {
    const live = html(createElement(ShipmentDoneView, { model: toShipmentDoneViewProps({ ...orderShipmentDone, backHref: "/orders/o-1" }) }));
    expect(live).toMatch(/<a\b[^>]*href="\/orders\/o-1"[^>]*>Open order<\/a>/);
    expect(html(createElement(ShipmentDoneView, { model: toShipmentDoneViewProps(orderShipmentDone) }))).toMatch(/data-to="Order"[^>]*>Open order</);
  });

  it("the drawing still names Return shipment as the correction", () => {
    const markup = html(createElement(ShipmentDoneView, { model: toShipmentDoneViewProps(orderShipmentDone) }));
    expect(markup).toMatch(/INV-1042 · assigned/);
    expect(markup).toMatch(/2\.00 bbl/);
    expect(markup).toMatch(/To correct this shipment, use Return shipment\./);
  });
});

describe("Return and credit view", () => {
  it("keeps an invoice-only return factual and uses the selected destination", () => {
    const model = toReturnCreditViewProps({ ...orderReturnCredit, order: undefined, returnLocationId: "taproom", locations: [{ id: "taproom", name: "Taproom" }], lines: orderReturnCredit.lines.slice(0, 1) });
    expect(model.backTo).toBe("INV-1042");
    expect(model.tape[0]).toEqual(["+1 Hazy IPA · ½ bbl keg · return in", "Taproom"]);
    expect(model.tape.at(-1)).toEqual(["credit memo number · on commit", "−$150.00"]);
  });

  it("sums individually rounded return credits using exact quantity hundredths", () => {
    const model = toReturnCreditViewProps({
      ...orderReturnCredit,
      lines: [
        { ...orderReturnCredit.lines[0], qty_returning: 1.15, unit_price_cents: 50 },
        { ...orderReturnCredit.lines[0], id: "second", qty_returning: 0.33, unit_price_cents: 150 },
      ],
    });
    expect(model.tape.at(-1)).toEqual(["credit memo number · on commit", "−$1.08"]);
  });
  it("credits the beer and the refunded keg deposit in one memo, in whole kegs, with no stock for the deposit", () => {
    const model = toReturnCreditViewProps(orderReturnCredit);
    expect(model.title).toBe("Beer return");
    expect(model.lines[0]).toMatchObject({ detail: "shipped 4 · returning", qty: 1, step: "0.01" });
    expect(model.lines[1]).toMatchObject({ name: "Keg deposit · ½ bbl", detail: "deposit on 4 kegs · refunding", qty: 1, step: "1" });
    expect(model.reasons).toEqual(["Damaged · written to loss", "Wrong item · back to stock", "Unsold · back to stock"]);
    expect(model.returnTo).toBe("Warehouse · original fulfillment source");
    expect(model.creditInfo).toMatch(/INV-1042/);
    expect(model.tape).toEqual([
      ["+1 Hazy IPA · ½ bbl keg · return in", "Warehouse"],
      ["−1 Hazy IPA · ½ bbl keg · loss · damaged", "not sellable"],
      ["1 Keg deposit · ½ bbl · deposit refund", "−$30.00"],
      ["credit memo number · on commit", "−$180.00"],
    ]);
  });

  it("the drawing still shows Return shipment", () => {
    const markup = html(createElement(ReturnCreditView, { model: toReturnCreditViewProps(orderReturnCredit) }));
    expect(markup).toMatch(/Beer return/);
    expect(markup).toMatch(/shipped 4 · returning/);
    expect(markup).toMatch(/Damaged · written to loss/);
    expect(markup).toMatch(/Wrong item · back to stock/);
    expect(markup).toMatch(/Unsold · back to stock/);
    expect(markup).toMatch(/Return to/);
    expect(markup).toMatch(/−\$30\.00/);
    expect(markup).toMatch(/INV-1042/);
    expect(markup).toMatch(/>Return shipment</);
    expect(markup).toContain('data-variant="irreversible"');
  });

  it("omits beer disposition and destination for a deposit-only refund until empty-keg check-in is selected", () => {
    const model = toReturnCreditViewProps({ ...orderReturnCredit, lines: orderReturnCredit.lines.filter(line => line.kind === "keg_deposit"), reason: "" });
    const refund = html(createElement(ReturnCreditView, { model }));
    expect(refund).not.toContain('aria-label="Reason"');
    expect(refund).not.toContain("Return to");
    expect(refund).toContain("Check in empty kegs with this refund");
    expect(model.tape.at(-1)).toEqual(["credit memo number · on commit", "−$30.00"]);
    const checkIn = html(createElement(ReturnCreditView, { model, returnEmptyKegs: true, bins: [{ id: "cold", name: "Cold" }] }));
    expect(checkIn).toContain("Return to bin");
  });
});

describe("Return shipment names what it waits for (#1485)", () => {
  // Beer shipped 3 (fractions allowed); a keg deposit on 3 kegs (whole kegs only).
  const beer = { key: "beer", name: "Hazy IPA", maxReturning: 3, step: "0.01" };
  const keg = { key: "keg", name: "Keg deposit", maxReturning: 3, step: "1" };
  const lines = [beer, keg].map(line => ({ ...line, detail: "", qty: 0, shipped: 3 }));
  const ready = { lines, quantities: { beer: "1" }, reason: "unsold", locationId: "warehouse", binMissing: false };

  it("marks a negative, over-shipped or too-fine quantity at its field; 1.5 beer is valid", () => {
    expect(returnQuantityError("", beer)).toBeUndefined();
    expect(returnQuantityError("0", beer)).toBeUndefined();
    expect(returnQuantityError("1.5", beer)).toBeUndefined();
    expect(returnQuantityError("3", beer)).toBeUndefined();
    for (const qty of ["-1", "5", "1.555", "abc"]) expect(returnQuantityError(qty, beer)).toBe("Enter a quantity from 0 to 3, with at most two decimal places.");
    expect(returnQuantityError("1e3", beer)).toMatch(/exponent notation/);
    expect(returnQuantityError("2", keg)).toBeUndefined();
    expect(returnQuantityError("1.5", keg)).toBe("Enter a whole number of kegs from 0 to 3.");
  });

  it("is null when ready, and never drops a bad line silently", () => {
    expect(returnCreditReason(ready)).toBeNull();
    expect(returnCreditReason({ ...ready, quantities: { beer: "1.5" } })).toBeNull();
    expect(returnCreditReason({ ...ready, quantities: { beer: "-1" } })).toBe("Still needed: a valid quantity for Hazy IPA.");
    expect(returnCreditReason({ ...ready, quantities: { beer: "5" } })).toBe("Still needed: a valid quantity for Hazy IPA.");
    // One valid line does not carry a bad one.
    expect(returnCreditReason({ ...ready, quantities: { beer: "1", keg: "1.5" } })).toBe("Still needed: a valid quantity for Keg deposit.");
  });

  it("lists every missing choice in form order", () => {
    expect(returnCreditReason({ lines, quantities: {}, reason: "", locationId: "", binMissing: false }))
      .toBe("Still needed: a quantity to return.");
    expect(returnCreditReason({ ...ready, binMissing: true })).toBe("Still needed: a return bin.");
    expect(returnCreditReason({ ...ready, reason: "", locationId: "" })).toBe("Still needed: a reason and a return location.");
    expect(returnCreditReason({ lines, quantities: { keg: "1" }, reason: "", locationId: "", binMissing: true })).toBeNull();
    expect(returnCreditReason({ lines, quantities: { keg: "1" }, reason: "", locationId: "", binMissing: true, returnEmptyKegs: true }))
      .toBe("Still needed: a return location and a return bin.");
  });

  it("prints the reason beside the withheld button and a bad quantity under its field", () => {
    const model = toReturnCreditViewProps({ ...orderReturnCredit, lines: orderReturnCredit.lines.map(line => ({ ...line, qty_returning: -1 })) });
    const markup = html(createElement(ReturnCreditView, { model, blockedReason: "Still needed: a valid quantity for Hazy IPA." }));
    expect(markup).toMatch(/<p id="([^"]+)"[^>]*>Still needed: a valid quantity for Hazy IPA\.<\/p>/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"[^>]*>Return shipment<\/button>/);
    expect(markup).toContain("Enter a quantity from 0 to 4, with at most two decimal places.");
  });
});

const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("inventory records mount the sheet views", () => {
  it.each([
    ["Short pick", ShortPickView, toShortPickViewProps(orderShortPick)],
    ["Pick", PickView, toPickViewProps(orderPick)],
    ["Ship and invoice", ShipView, toShipViewProps(orderShipInvoice)],
    ["Ship on delivery", ShipView, toShipViewProps(orderShipOnDelivery)],
    ["Shipment done", ShipmentDoneView, toShipmentDoneViewProps(orderShipmentDone)],
    ["Return and credit", ReturnCreditView, toReturnCreditViewProps(orderReturnCredit)],
  ] as const)("%s body is the shared view", (name, type, model) => {
    const body = screen(name).body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen(name).body)).toBe(true);
    expect(body.type).toBe(type);
    expect(body.props.model).toEqual(model);
  });
});

it("labels refused-delivery returns separately from accepted beer returns", () => {
  const model = toReturnCreditViewProps({ ...orderReturnCredit, refusedDeliveryId: "delivery-id" });
  expect(model.note).toContain("refused beer");
  expect(model.note).toContain("accepted beer");
});

it("bounds refusal returns by the outstanding quantity without changing shipped facts", () => {
  const model = toReturnCreditViewProps({ ...orderReturnCredit, lines: orderReturnCredit.lines.map(line => ({ ...line, qty_shipped: 4, qty_returnable: 2 })) });
  expect(model.lines[0].shipped).toBe(4);
  expect(model.lines[0].maxReturning).toBe(2);
});
