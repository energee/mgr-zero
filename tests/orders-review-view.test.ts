// tests/orders-review-view.test.ts — Confirm order, Complete transfer, and
// Put back share one drawing each with their live pages (same loop as Order).
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { COMPLETE_TRANSFER_EXEMPLAR, CompleteTransferView } from "../components/mgr/views/complete-transfer";
import { CONFIRM_ORDER_EXEMPLAR, ConfirmOrderView } from "../components/mgr/views/confirm-order";
import { PUT_BACK_EXEMPLAR, PutBackView } from "../components/mgr/views/put-back";
import { toCompleteTransferViewProps } from "../lib/mgr/complete-transfer-view";
import { toConfirmOrderViewProps } from "../lib/mgr/confirm-order-view";
import { toPutBackViewProps } from "../lib/mgr/put-back-view";

const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const html = (name: string) => renderToStaticMarkup(createElement("div", null, screen(name).body));
const noSecondTree = (file: string) => {
  const src = readFileSync(file, "utf8");
  expect(src, file).not.toMatch(/from "@\/components\/mgr\/e"/);
  expect(src, file).not.toMatch(/\bE\.(back|row|ttl|fld|act|tape|btn|pick|note|info)\b/);
  return src;
};

describe("Confirm order view loop", () => {
  it("maps get_order-shaped data onto the view model", () => {
    const model = toConfirmOrderViewProps({
      order: {
        id: "11111111-1111-1111-1111-111111111111",
        order_no: 231,
        status: "submitted",
        requested_ship_date: "2026-09-10",
        from_location_id: "loc-wh",
        customers: { name: "Ridgeline Tap Room" },
      },
      lines: [
        { id: "l1", sku_id: "s1", qty_ordered: 4, skus: { name: "Hazy IPA · ½ bbl keg" } },
        { id: "l2", sku_id: "s2", qty_ordered: 10, skus: { name: "Pils · 16 oz case" } },
      ],
      atp: [{ sku_id: "s1", qty: 11 }, { sku_id: "s2", qty: -6 }],
      locations: [{ id: "loc-wh", name: "Warehouse" }],
    });
    expect(model.title).toBe("ORD-0231");
    expect(model.where).toBe("Ridgeline Tap Room");
    expect(model.state).toBe("Submitted · ships 2026-09-10");
    expect(model.fulfillmentSource).toBe("Warehouse");
    expect(model.lines[1]?.tone).toBe("w");
    expect(model.oversellNotes[0]).toMatch(/Pils · 16 oz case/);
  });

  it("the inventory record is ConfirmOrderView with the exemplar mock", () => {
    const body = screen("Confirm order").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Confirm order").body)).toBe(true);
    expect(body.type).toBe(ConfirmOrderView);
    expect(body.props.model).toBe(CONFIRM_ORDER_EXEMPLAR);
  });

  it("the inventory drawing still shows the two-tap confirm verbs", () => {
    expect(html("Confirm order")).toMatch(/Submitted · ships Thu/);
    expect(html("Confirm order")).toMatch(/>Confirm order</);
    expect(html("Confirm order")).not.toMatch(/Next: confirm/);
  });

  it("the live page mounts ConfirmOrderView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/confirm/page.tsx");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/confirm-order"/);
    expect(src).toMatch(/<ConfirmOrderView\b/);
  });
});

describe("Complete transfer view loop", () => {
  it("maps get_order-shaped data onto the view model", () => {
    const model = toCompleteTransferViewProps({
      order: {
        id: "11111111-1111-1111-1111-111111111111",
        order_no: 88,
        from_location_id: "loc-wh",
        to_location_id: "loc-tr",
      },
      lines: [
        { id: "l1", qty_ordered: 4, qty_picked: 4, skus: { name: "Pils · 16 oz case" } },
      ],
      locations: [
        { id: "loc-wh", name: "Warehouse" },
        { id: "loc-tr", name: "Taproom" },
      ],
    });
    expect(model.backTo).toBe("ORD-0088");
    expect(model.backHref).toBe("/orders/11111111-1111-1111-1111-111111111111");
    expect(model.fromLabel).toBe("Warehouse");
    expect(model.toLabel).toBe("Taproom");
    expect(model.lines[0]?.detail).toBe("4 / 4");
  });

  it("the inventory record is CompleteTransferView with the exemplar mock", () => {
    const body = screen("Complete transfer").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(CompleteTransferView);
    expect(body.props.model).toBe(COMPLETE_TRANSFER_EXEMPLAR);
  });

  it("the live page mounts CompleteTransferView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/complete/page.tsx");
    expect(src).toMatch(/<CompleteTransferView\b/);
  });
});

describe("Put back view loop", () => {
  it("maps staged quantities from get_order", () => {
    const model = toPutBackViewProps({
      order: { id: "o1", order_no: 229, status: "picked", needs_restock: true },
      lines: [
        { id: "l1", qty_ordered: 7, qty_picked: 10, skus: { name: "Pils · 16 oz case" } },
        { id: "l2", qty_ordered: 4, qty_picked: 4, skus: { name: "Hazy IPA · ½ bbl keg" } },
      ],
    });
    expect(model.title).toBe("ORD-0229 · put back");
    expect(model.lines).toEqual([{ key: "l1", name: "Pils · 16 oz case", staged: "3" }]);
    expect(model.verb).toBe("Put back 3");
  });

  it("the inventory record is PutBackView with the exemplar mock", () => {
    const body = screen("Put back").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PutBackView);
    expect(body.props.model).toBe(PUT_BACK_EXEMPLAR);
  });

  it("the live page mounts PutBackView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/restock/page.tsx");
    expect(src).toMatch(/<PutBackView\b/);
  });
});
