// tests/orders-review-view.test.ts — Confirm order, Complete transfer, and
// Put back share one drawing each with their live pages. Fixtures are
// get_order snapshots painted by the adapters.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AtpWarnings } from "../app/(app)/orders/[id]/atp-warnings";
import { SCREENS } from "../components/mgr/screens";
import { CompleteTransferView } from "../components/mgr/views/complete-transfer";
import { ConfirmOrderView } from "../components/mgr/views/confirm-order";
import { PutBackView } from "../components/mgr/views/put-back";
import { orderPickedRestock, orderPickedRestockPutBack, orderSubmittedRidgeline, orderTransferComplete } from "../lib/mgr/fixtures/orders";
import { toCompleteTransferViewProps } from "../lib/mgr/complete-transfer-view";
import { toConfirmOrderViewProps } from "../lib/mgr/confirm-order-view";
import { stagedQty, toPutBackViewProps } from "../lib/mgr/put-back-view";
import { toOrderViewProps } from "../lib/mgr/order-view";
import { OUNCES_PER_BBL } from "../lib/volume";

const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const html = (name: string) => renderToStaticMarkup(createElement("div", null, screen(name).body));
const noSecondTree = (file: string) => {
  const src = readFileSync(file, "utf8");
  expect(src, file).not.toMatch(/from "@\/components\/mgr\/e"/);
  expect(src, file).not.toMatch(/\bE\.(back|row|ttl|fld|act|tape|btn|pick|note|info)\b/);
  return src;
};

describe("Confirm order view loop", () => {
  it("resolves warning SKU identities and separately announces a saved write", () => {
    const props = {
      warnings: [{ sku_id: "hazy-id", atp: -2 }],
      skuNames: new Map([["other-id", "Unrelated beer"], ["hazy-id", "Hazy IPA"]]),
    };
    const saved = renderToStaticMarkup(createElement(AtpWarnings, { ...props, saved: "Fixture save" }));
    expect(saved).toContain("Hazy IPA");
    expect(saved).not.toContain("Unrelated beer");
    expect(saved).not.toContain("hazy-id");
    expect(saved.match(/role="status"/g)).toHaveLength(2);
    const unsaved = renderToStaticMarkup(createElement(AtpWarnings, props));
    expect(unsaved.match(/role="status"/g)).toHaveLength(1);
  });

  it("preserves source identity and shortage arithmetic", () => {
    const line = { ...orderSubmittedRidgeline.lines[0], qty_ordered: 5 };
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      locations: [{ id: orderSubmittedRidgeline.order.from_location_id, name: "Lawrenceville" }],
      lines: [line],
      sourceOnHand: [{ sku_id: line.sku_id, qty: 3 }],
      atp: [{ sku_id: line.sku_id, qty: 3 }],
    });
    expect(model.fulfillmentSource).toBe("Lawrenceville");
    expect(model.lines[0].detail).toContain("3");
    expect(model.lines[0].detail).toContain("−2");
    expect(model.shortageNote).toContain(line.skus!.name);
    expect(model.shortageNote).toContain("Lawrenceville");
  });

  it("maps the shared fixture through the adapter", () => {
    const model = toConfirmOrderViewProps(orderSubmittedRidgeline);
    expect(model.title).toBe("ORD-0231");
    expect(model.where).toBe("Ridgeline Tap Room");
    expect(model.state).toBe("Submitted · ships Sep 10, 2026");
    expect(model.fulfillmentSource).toBe("Warehouse");
    expect(model.lines[1]?.tone).toBe("w");
    expect(model.shortageNote).toMatch(/Pils · 16 oz case/);
    // Staff read the next verb, not the state machine (#1037).
    expect(renderToStaticMarkup(createElement(ConfirmOrderView, { model }))).not.toContain("Lifecycle");
  });

  it("groups lines under their brand, each named by its format, in name order", () => {
    const [hazy, pils] = orderSubmittedRidgeline.lines;
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      lines: [
        { ...pils, skus: { name: "Pils · Case", brands: { name: "Pils" }, formats: { name: "Case" } } },
        { ...hazy, skus: { name: "Hazy · Half", brands: { name: "Hazy" }, formats: { name: "Half" } } },
        { ...hazy, id: "l-hazy-case", sku_id: "hazy-case", skus: { name: "Hazy · Case", brands: { name: "Hazy" }, formats: { name: "Case" } } },
      ],
    });
    expect(model.lines.map((l) => [l.group, l.name])).toEqual([["Hazy", "Case"], ["Hazy", "Half"], ["Pils", "Case"]]);
    expect(renderToStaticMarkup(createElement(ConfirmOrderView, { model }))).toMatch(/>Hazy<\/h2>[\s\S]*>Case<[\s\S]*>Half<[\s\S]*>Pils<\/h2>[\s\S]*>Case</);
  });

  it("draws each line's quantity as the shared number field when it can be edited", () => {
    const model = toConfirmOrderViewProps(orderSubmittedRidgeline);
    const markup = renderToStaticMarkup(createElement(ConfirmOrderView, { model, quantities: { "l-hazy": "3" }, onQuantity: () => {} }));
    expect(markup.match(/aria-label="Decrease"/g)).toHaveLength(2);
    expect(markup).toMatch(/value="3"/);
    expect(markup).toMatch(/value="10"/);
  });

  it("distinguishes source stock from brewery ATP without inventing another stocked location", () => {
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      lines: [orderSubmittedRidgeline.lines[0]],
      atp: [{ sku_id: orderSubmittedRidgeline.lines[0].sku_id, qty: 5 }],
      sourceOnHand: [{ sku_id: orderSubmittedRidgeline.lines[0].sku_id, qty: 0 }],
    });
    expect(model.lines[0].qty).toBe(4);
    expect(model.lines[0].detail).toBe("0 at Warehouse · 5 available");
    expect(model.lines[0].tone).toBe("w");
    expect(model.shortageNote).toMatch(/Replenish Warehouse.*the full quantity cannot be picked there/i);
    expect(model.shortageNote).not.toMatch(/another location/i);
  });

  it("does not claim other-location stock for a single-location shortage", () => {
    const sku = orderSubmittedRidgeline.lines[0];
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      lines: [sku],
      atp: [{ sku_id: sku.sku_id, qty: 3 }],
      sourceOnHand: [{ sku_id: sku.sku_id, qty: 3 }],
    });
    expect(model.lines[0].detail).toMatch(/3 at Warehouse/);
    expect(model.shortageNote).toMatch(/Short at Warehouse: .*Replenish Warehouse.*the full quantity cannot be picked there/i);
    expect(model.shortageNote).not.toMatch(/another location/i);
  });

  it("warns when this order's own quantity takes ATP negative (#415)", () => {
    // ATP excludes a submitted order's own quantity until confirm allocates it:
    // ATP 5 with this order asking 10 leaves −5 after confirm.
    const sku = { ...orderSubmittedRidgeline.lines[0], qty_ordered: 10 };
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      lines: [sku],
      atp: [{ sku_id: sku.sku_id, qty: 5 }],
      sourceOnHand: [{ sku_id: sku.sku_id, qty: 10 }],
    });
    expect(model.lines[0].tone).toBe("w");
    expect(model.lines[0].detail).toMatch(/5 available · leaves −5$/);
    expect(model.shortageNote).toMatch(/^Confirming promises more than is available for .*; that stays your call\.$/);
  });

  it("does not warn when ATP covers this order exactly", () => {
    const sku = { ...orderSubmittedRidgeline.lines[0], qty_ordered: 5 };
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      lines: [sku],
      atp: [{ sku_id: sku.sku_id, qty: 5 }],
      sourceOnHand: [{ sku_id: sku.sku_id, qty: 10 }],
    });
    expect(model.lines[0].tone).toBe("");
    expect(model.shortageNote).toBeNull();
  });

  it("does not claim other-location stock for a never-stocked SKU", () => {
    const sku = orderSubmittedRidgeline.lines[0];
    const model = toConfirmOrderViewProps({
      ...orderSubmittedRidgeline,
      lines: [sku],
      atp: [],
      sourceOnHand: [],
    });
    expect(model.shortageNote).toMatch(/Short at Warehouse: .*Replenish Warehouse.*the full quantity cannot be picked there/i);
    expect(model.shortageNote).not.toMatch(/another location/i);
  });

  it("the inventory record is ConfirmOrderView painted from that fixture", () => {
    const body = screen("Confirm order").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Confirm order").body)).toBe(true);
    expect(body.type).toBe(ConfirmOrderView);
    expect(body.props.model).toEqual(toConfirmOrderViewProps(orderSubmittedRidgeline));
  });

  it("the inventory drawing still shows the two-tap confirm verbs", () => {
    expect(html("Confirm order")).toMatch(/Submitted · ships Sep 10, 2026/);
    expect(html("Confirm order")).toMatch(/>Confirm order</);
    expect(html("Confirm order")).not.toMatch(/Next: confirm/);
  });

  it("the live page mounts ConfirmOrderView with no second E.* tree", () => {
    noSecondTree("app/(app)/orders/[id]/confirm/page.tsx");
    const src = noSecondTree("app/(app)/orders/[id]/confirm/confirm-buttons.tsx");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/confirm-order"/);
    expect(src).toMatch(/<ConfirmOrderView\b/);
  });

  it("a confirm that returns warnings says it was confirmed and stops editing quantities (#1489)", () => {
    const src = readFileSync("app/(app)/orders/[id]/confirm/confirm-buttons.tsx", "utf8");
    expect(src).toMatch(/<AtpWarnings\b[^\n]*saved="Order confirmed\."/);
    expect(src).toMatch(/<ConfirmOrderView\b[^\n]*readOnly=\{Boolean\(warnings\)\}/);
    const model = toConfirmOrderViewProps(orderSubmittedRidgeline);
    const confirmed = renderToStaticMarkup(createElement(ConfirmOrderView, { model, readOnly: true, footer: null }));
    expect(confirmed.match(/<input[^>]*type="number"[^>]*>/g)!.every(input => /\breadOnly=""/.test(input))).toBe(true);
    expect(confirmed).toMatch(/aria-label="Increase"[^>]*disabled=""|disabled=""[^>]*aria-label="Increase"/);
    const editable = renderToStaticMarkup(createElement(ConfirmOrderView, { model, footer: null }));
    expect(editable).not.toMatch(/readOnly=""/);
  });
});

describe("Complete transfer view loop", () => {
  it("maps the shared fixture through the adapter", () => {
    const model = toCompleteTransferViewProps(orderTransferComplete);
    expect(model.backTo).toBe("ORD-0088");
    expect(model.backHref).toBeUndefined();
    expect(model.fromLabel).toBe("Warehouse");
    expect(model.toLabel).toBe("Taproom");
    expect(model.lines[0]?.detail).toBe("4 / 4");
  });

  it("formats each tape leg from the unrounded volume (#456)", () => {
    const line = { id: "l-can", qty_ordered: 1, qty_picked: 1, bbl_per_unit: 12 / OUNCES_PER_BBL, skus: { name: "Can" } };
    const model = toCompleteTransferViewProps({ ...orderTransferComplete, lines: [line] });
    expect(model.tape.map(([, volume]) => volume)).toEqual(["12 oz", "12 oz"]);
  });

  it("the inventory record is CompleteTransferView painted from that fixture", () => {
    const body = screen("Complete transfer").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(CompleteTransferView);
    expect(body.props.model).toEqual(toCompleteTransferViewProps(orderTransferComplete));
  });

  it("the live page mounts CompleteTransferView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/complete/page.tsx");
    expect(src).toMatch(/<ShipForm\b/);
    expect(noSecondTree("app/(app)/orders/[id]/ship-form.tsx")).toMatch(/<CompleteTransferView\b/);
  });
});

describe("Put back view loop", () => {
  it("maps staged quantities from the shared picked-restock fixture", () => {
    const model = toPutBackViewProps(orderPickedRestockPutBack);
    expect(model.title).toBe("ORD-0229 · put back");
    expect(model.lines).toEqual([{ key: "l-pils", name: "Pils · 16 oz case", staged: "3" }]);
    expect(model.verb).toBe("Put back 3");
  });

  // #417
  it("stages picked − shipped after a short ship, not picked − ordered", () => {
    const line = { id: "l", qty_ordered: 10, qty_picked: 10, qty_shipped: 6, skus: { name: "Pils" } };
    expect(stagedQty("shipped", line)).toBe(4);
    const model = toPutBackViewProps({
      order: { id: "o", order_no: 240, status: "shipped", needs_restock: true },
      lines: [line],
    });
    expect(model.lines).toEqual([{ key: "l", name: "Pils", staged: "4" }]);
    expect(model.verb).toBe("Put back 4");
  });

  it("stages picked − ordered before shipping and everything on a cancel", () => {
    expect(stagedQty("picked", { qty_ordered: 6, qty_picked: 10, qty_shipped: null })).toBe(4);
    expect(stagedQty("picked", { qty_ordered: 12, qty_picked: 10, qty_shipped: null })).toBe(0);
    expect(stagedQty("cancelled", { qty_ordered: 6, qty_picked: 10, qty_shipped: null })).toBe(10);
    expect(stagedQty("picked", { qty_ordered: 6, qty_picked: null, qty_shipped: null })).toBe(0);
  });

  it("the Order restock note names the same staged quantity after a short ship", () => {
    const model = toOrderViewProps({
      ...orderPickedRestock,
      order: { ...orderPickedRestock.order, status: "shipped" },
      lines: [{ ...orderPickedRestock.lines[1]!, qty_ordered: 10, qty_picked: 10, qty_shipped: 6 }],
    });
    expect(model.restockNote).toMatch(/^Put back 4 Pils/);
  });

  it("the inventory record is PutBackView painted from that fixture", () => {
    const body = screen("Put back").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PutBackView);
    expect(body.props.model).toEqual(toPutBackViewProps(orderPickedRestockPutBack));
  });

  it("the live page mounts PutBackView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/restock/page.tsx");
    expect(src).toMatch(/<PutBackView\b/);
  });
});
