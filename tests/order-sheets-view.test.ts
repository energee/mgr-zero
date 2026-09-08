// tests/order-sheets-view.test.ts — Adjust / Short pick / Pick / Ship /
// Shipment done / Return share one drawing each with their live sheets.
// Fixtures are get_order snapshots painted by the adapters.
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { AdjustLinesView } from "../components/mgr/views/adjust-lines";
import { PickView } from "../components/mgr/views/pick";
import { ReturnCreditView } from "../components/mgr/views/return-credit";
import { ShipView } from "../components/mgr/views/ship";
import { ShipmentDoneView } from "../components/mgr/views/shipment-done";
import { ShortPickView } from "../components/mgr/views/short-pick";
import {
  orderAdjustLines,
  orderPick,
  orderReturnCredit,
  orderShipInvoice,
  orderShipOnDelivery,
  orderShipmentDone,
  orderShortPick,
} from "../lib/mgr/fixtures/order-sheets";
import { toAdjustLinesViewProps } from "../lib/mgr/adjust-lines-view";
import { toPickViewProps } from "../lib/mgr/pick-view";
import { toReturnCreditViewProps } from "../lib/mgr/return-credit-view";
import { toShipViewProps } from "../lib/mgr/ship-view";
import { toShipmentDoneViewProps } from "../lib/mgr/shipment-done-view";
import { toShortPickViewProps } from "../lib/mgr/short-pick-view";

const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(node);
const SOURCES = ["Warehouse", "Taproom"];

describe("Adjust lines view", () => {
  it("maps picked-below-ordered as a warning stepper", () => {
    const model = toAdjustLinesViewProps(orderAdjustLines);
    expect(model.backTo).toBe("ORD-0229");
    expect(model.lines.map((l) => [l.name, l.qty, l.detail, l.tone])).toEqual([
      ["Hazy IPA · ½ bbl keg", 4, "", ""],
      ["Pils · 16 oz case", 7, "picked 10", "w"],
      ["Stout · ⅙ bbl keg", 2, "", ""],
    ]);
  });

  it("the drawing still shows Save lines and the customer-cut reason", () => {
    const markup = html(createElement(AdjustLinesView, {
      model: toAdjustLinesViewProps(orderAdjustLines),
      reason: "customer cut",
    }));
    expect(markup).toMatch(/ORD-0229/);
    expect(markup).toMatch(/Adjust lines/);
    expect(markup).toMatch(/picked 10/);
    expect(markup).toMatch(/customer cut/);
    expect(markup).toMatch(/>Save lines</);
    expect(markup).toMatch(/aria-label="Decrease"/);
  });
});

describe("Short pick view", () => {
  it("maps the short Pils line onto the adjust-down verb", () => {
    const model = toShortPickViewProps(orderShortPick);
    expect(model.title).toBe("ORD-0231 · short line");
    expect(model.source).toBe("Ridgeline Tap Room · Warehouse");
    expect(model.counted).toBe(7);
    expect(model.missing).toBe(3);
    expect(model.resolveTitle).toBe("Resolve the missing 3");
    expect(model.chips).toEqual(["Adjust order to 7", "Keep 3 owed · staged"]);
    expect(model.verb).toBe("Adjust order to 7 cases");
  });

  it("the drawing still shows the preview arrow and Adjust order to 7 cases", () => {
    const markup = html(createElement(ShortPickView, { model: toShortPickViewProps(orderShortPick) }));
    expect(markup).toMatch(/Pick/);
    expect(markup).toMatch(/ORD-0231 · short line/);
    expect(markup).toMatch(/Ridgeline Tap Room · Warehouse/);
    expect(markup).toMatch(/ordered 10/);
    expect(markup).toMatch(/Reason/);
    expect(markup).toMatch(/required/);
    expect(markup).toMatch(/Resolve the missing 3/);
    expect(markup).toMatch(/Adjust order to 7/);
    expect(markup).toMatch(/Keep 3 owed · staged/);
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
    expect(model.lines.map((l) => [l.qty, l.tone])).toEqual([[4, "ok"], [10, "ok"], [2, "ok"]]);
  });

  it("the drawing still shows Print pick sheet and Done picking", () => {
    const markup = html(createElement(PickView, { model: toPickViewProps(orderPick) }));
    expect(markup).toMatch(/From Warehouse/);
    expect(markup).toMatch(/Print pick sheet/);
    expect(markup).toMatch(/>Done picking</);
    expect(markup).toMatch(/aria-label="Decrease"/);
  });
});

describe("Ship view", () => {
  it("maps a short Pils ship onto reason, restock tape, and invoice-now", () => {
    const model = toShipViewProps(orderShipInvoice);
    expect(model.title).toBe("Ship");
    expect(model.fulfillmentSource).toBe("Warehouse");
    expect(model.lines[1]).toMatchObject({ qty: 9, tone: "w", detail: "ordered 10 · picked 10" });
    expect(model.shortNote).toMatch(/Shipping 9 of 10 Pils/);
    expect(model.tape).toEqual([
      ["−4 Hazy ½ bbl · sale removal · PA", "2.00 bbl"],
      ["−9 Pils cases · sale removal · PA", "0.87 bbl"],
      ["1 Pils case released · restock", ""],
      ["invoice number", "assigned on commit"],
    ]);
  });

  it("the invoice-now drawing still shows Reason required and Ship order", () => {
    const markup = html(createElement(ShipView, {
      model: toShipViewProps(orderShipInvoice),
      fulfillmentOptions: SOURCES,
    }));
    expect(markup).toMatch(/ORD-0231/);
    expect(markup).toMatch(/Fulfillment source/);
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

  it("maps all-as-picked onto deferred invoice tape", () => {
    const model = toShipViewProps(orderShipOnDelivery);
    expect(model.invoiceTiming).toBe("on_delivery");
    expect(model.shortNote).toBeUndefined();
    expect(model.lines.map((l) => [l.qty, l.detail, l.tone])).toEqual([
      [4, "picked 4", "ok"],
      [10, "picked 10", "ok"],
    ]);
    expect(model.tape).toEqual([
      ["−4 Hazy ½ bbl · sale removal · PA", "2.00 bbl"],
      ["−10 Pils cases · sale removal · PA", "0.97 bbl"],
      ["invoice number", "deferred to delivery"],
    ]);
  });

  it("On delivery is the same ShipView with chips index 1", () => {
    const markup = html(createElement(ShipView, {
      model: toShipViewProps(orderShipOnDelivery),
      fulfillmentOptions: SOURCES,
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
  it("maps INV-1042 onto the assigned invoice field", () => {
    const model = toShipmentDoneViewProps(orderShipmentDone);
    expect(model.backTo).toBe("ORD-0231");
    expect(model.title).toBe("Shipped");
    expect(model.invoice).toBe("INV-1042 · assigned");
    expect(model.tape.at(-1)).toEqual(["INV-1042", "invoiced now"]);
  });

  it("the drawing still names Return shipment as the correction", () => {
    const markup = html(createElement(ShipmentDoneView, { model: toShipmentDoneViewProps(orderShipmentDone) }));
    expect(markup).toMatch(/INV-1042 · assigned/);
    expect(markup).toMatch(/2\.00 bbl/);
    expect(markup).toMatch(/To correct this shipment, Return shipment/);
  });
});

describe("Return and credit view", () => {
  it("maps one Hazy keg plus deposit onto an $180 credit", () => {
    const model = toReturnCreditViewProps(orderReturnCredit);
    expect(model.title).toBe("Beer return");
    expect(model.lines[0]).toMatchObject({ detail: "shipped 4 · returning", qty: 1 });
    expect(model.reasons).toEqual(["damaged", "wrong item", "unsold"]);
    expect(model.returnTo).toBe("Warehouse · original fulfillment source");
    expect(model.depositAmount).toBe("−$30.00");
    expect(model.creditInfo).toMatch(/INV-1042/);
    expect(model.tape).toEqual([
      ["+1 Hazy ½ bbl · return in", "Warehouse"],
      ["−1 Hazy ½ bbl · loss · damaged", "not sellable"],
      ["credit memo number · on commit", "−$180.00"],
    ]);
  });

  it("the drawing still shows Return shipment", () => {
    const markup = html(createElement(ReturnCreditView, { model: toReturnCreditViewProps(orderReturnCredit) }));
    expect(markup).toMatch(/Beer return/);
    expect(markup).toMatch(/shipped 4 · returning/);
    expect(markup).toMatch(/damaged/);
    expect(markup).toMatch(/wrong item/);
    expect(markup).toMatch(/unsold/);
    expect(markup).toMatch(/Return to/);
    expect(markup).toMatch(/−\$30\.00/);
    expect(markup).toMatch(/INV-1042/);
    expect(markup).toMatch(/Keg fleet/);
    expect(markup).toMatch(/>Return shipment</);
    expect(markup).toContain('data-variant="irreversible"');
  });
});

const screen = (name: string) => SCREENS.find((s) => s.name === name)!;

describe("inventory records mount the sheet views", () => {
  it.each([
    ["Adjust lines", AdjustLinesView, toAdjustLinesViewProps(orderAdjustLines)],
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
