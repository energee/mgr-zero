// tests/orders-review-view.test.ts — Confirm order, Complete transfer, and
// Put back share one drawing each with their live pages. Fixtures are
// get_order snapshots painted by the adapters.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { CompleteTransferView } from "../components/mgr/views/complete-transfer";
import { ConfirmOrderView } from "../components/mgr/views/confirm-order";
import { PutBackView } from "../components/mgr/views/put-back";
import { orderPickedRestockPutBack, orderSubmittedRidgeline, orderTransferComplete } from "../lib/mgr/fixtures/orders";
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
  it("maps the shared fixture through the adapter", () => {
    const model = toConfirmOrderViewProps(orderSubmittedRidgeline);
    expect(model.title).toBe("ORD-0231");
    expect(model.where).toBe("Ridgeline Tap Room");
    expect(model.state).toBe("Submitted · ships 2026-09-10");
    expect(model.fulfillmentSource).toBe("Warehouse");
    expect(model.lines[1]?.tone).toBe("w");
    expect(model.oversellNotes[0]).toMatch(/Pils · 16 oz case/);
  });

  it("the inventory record is ConfirmOrderView painted from that fixture", () => {
    const body = screen("Confirm order").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Confirm order").body)).toBe(true);
    expect(body.type).toBe(ConfirmOrderView);
    expect(body.props.model).toEqual(toConfirmOrderViewProps(orderSubmittedRidgeline));
  });

  it("the inventory drawing still shows the two-tap confirm verbs", () => {
    expect(html("Confirm order")).toMatch(/Submitted · ships 2026-09-10/);
    expect(html("Confirm order")).toMatch(/>Confirm order</);
    expect(html("Confirm order")).not.toMatch(/Next: confirm/);
  });

  it("the live page mounts ConfirmOrderView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/confirm/page.tsx");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/confirm-order"/);
    expect(src).toMatch(/<ConfirmOrderView\b/);
    expect(src).toMatch(/backHref: "\/orders"/);
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

  it("the inventory record is CompleteTransferView painted from that fixture", () => {
    const body = screen("Complete transfer").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(CompleteTransferView);
    expect(body.props.model).toEqual(toCompleteTransferViewProps(orderTransferComplete));
  });

  it("the live page mounts CompleteTransferView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/complete/page.tsx");
    expect(src).toMatch(/<CompleteTransferView\b/);
    expect(src).toMatch(/backHref:/);
  });
});

describe("Put back view loop", () => {
  it("maps staged quantities from the shared picked-restock fixture", () => {
    const model = toPutBackViewProps(orderPickedRestockPutBack);
    expect(model.title).toBe("ORD-0229 · put back");
    expect(model.lines).toEqual([{ key: "l-pils", name: "Pils · 16 oz case", staged: "3" }]);
    expect(model.verb).toBe("Put back 3");
  });

  it("the inventory record is PutBackView painted from that fixture", () => {
    const body = screen("Put back").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PutBackView);
    expect(body.props.model).toEqual(toPutBackViewProps(orderPickedRestockPutBack));
  });

  it("the live page mounts PutBackView with no second E.* tree", () => {
    const src = noSecondTree("app/(app)/orders/[id]/restock/page.tsx");
    expect(src).toMatch(/<PutBackView\b/);
    expect(src).toMatch(/backHref: "\/"/);
  });
});
