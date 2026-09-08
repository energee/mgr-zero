// tests/order-view.test.ts — the Order inventory record and the live order
// page share one drawing (OrderView). Fixtures are get_order snapshots;
// toOrderViewProps paints both the docs frame and the live page.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { OrderView } from "../components/mgr/views/order";
import { orderPickedRestock } from "../lib/mgr/fixtures/orders";
import { toOrderViewProps } from "../lib/mgr/order-view";

const PAGE = "app/(app)/orders/[id]/page.tsx";

describe("Order view loop", () => {
  it("maps the shared fixture through the adapter", () => {
    const model = toOrderViewProps(orderPickedRestock);
    expect(model.title).toBe("ORD-0229");
    expect(model.where).toBe("Al’s Bar · Columbus, OH");
    expect(model.currentState).toBe("Picked · restock pending");
    expect(model.next).toBe("Next: put back");
    expect(model.customerPo).toBe("4471");
    expect(model.fulfillmentSource).toBe("Warehouse");
    expect(model.putBackHref).toBe("#");
    expect(model.lines[0]?.detail).toContain("ordered 4");
    expect(model.lines[0]?.detail).toContain("ATP 11");
    expect(model.lines[1]?.tone).toBe("w");
    expect(String(model.events.at(-1)?.[0])).toMatch(/lines adjusted/);
  });

  it("the Order inventory record is OrderView painted from that fixture", () => {
    const screen = SCREENS.find((s) => s.name === "Order");
    expect(isValidElement(screen!.body)).toBe(true);
    const body = screen!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(OrderView);
    expect(body.props.model).toEqual(toOrderViewProps(orderPickedRestock));
  });

  it("the inventory Order drawing still shows the exemplar verbs and restock copy", () => {
    const html = renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === "Order")!.body));
    expect(html).toMatch(/>Add line</);
    expect(html.match(/data-row-action[^>]*>Adjust</g)).toHaveLength(3);
    expect(html).toMatch(/ORD-0229/);
    expect(html).toMatch(/Picked · restock pending/);
    expect(html).toMatch(/Cancel order/);
  });

  it("the live Order page mounts OrderView via the adapter, with no second E.* tree", () => {
    const src = readFileSync(PAGE, "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/order"/);
    expect(src).toMatch(/from "@\/lib\/mgr\/order-view"/);
    expect(src).toMatch(/<OrderView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).not.toMatch(/\bE\.(back|row|ttl|fld|act|tape|btn)\b/);
  });
});
