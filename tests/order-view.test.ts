// tests/order-view.test.ts — the Order inventory record and the live order
// page share one drawing (OrderView). A mock feeds the docs; toOrderViewProps
// maps get_order onto the same props. Drift is a missing import or a second
// E.* tree on the page, not two layouts.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ORDER_PICKED_RESTOCK, OrderView } from "../components/mgr/views/order";
import { toOrderViewProps } from "../lib/mgr/order-view";

const PAGE = "app/(app)/orders/[id]/page.tsx";

describe("Order view loop", () => {
  it("maps get_order-shaped data onto the view model", () => {
    const model = toOrderViewProps({
      order: {
        id: "11111111-1111-1111-1111-111111111111",
        order_no: 229,
        kind: "wholesale",
        status: "picked",
        po_number: "4471",
        requested_ship_date: null,
        note: "Hold the stout",
        needs_restock: true,
        customers: { name: "Al’s Bar" },
        ship_tos: { label: "Main", city: "Columbus", state: "OH" },
      },
      lines: [
        { id: "l1", sku_id: "s1", qty_ordered: 4, qty_picked: 4, qty_shipped: null, unit_price_cents: 15000, skus: { name: "Hazy IPA · ½ bbl keg" } },
        { id: "l2", sku_id: "s2", qty_ordered: 7, qty_picked: 10, qty_shipped: null, unit_price_cents: 3800, skus: { name: "Pils · 16 oz case" } },
      ],
      events: [
        { id: "e1", event: "created", actor: "Ted", payload: {}, created_at: "2026-09-01T13:02:00.000Z" },
        { id: "e2", event: "lines_adjusted", actor: "Ted", payload: { before: { s2: 10 }, lines: { s2: 7 }, reason: "customer cut" }, created_at: "2026-09-02T13:15:00.000Z" },
      ],
      atp: [{ sku_id: "s1", qty: 11 }, { sku_id: "s2", qty: 3 }],
    });
    expect(model.title).toBe("ORD-0229");
    expect(model.where).toBe("Al’s Bar · Columbus, OH");
    expect(model.currentState).toBe("Picked · restock pending");
    expect(model.next).toBe("Next: put back");
    expect(model.customerPo).toBe("4471");
    expect(model.note).toBe("Hold the stout");
    expect(model.putBackHref).toBe("/orders/11111111-1111-1111-1111-111111111111/restock");
    expect(model.lines[0]?.detail).toContain("ordered 4");
    expect(model.lines[0]?.detail).toContain("ATP 11");
    expect(model.lines[1]?.tone).toBe("w");
    expect(String(model.events[1]?.[0])).toMatch(/lines adjusted/);
    expect(String(model.events[1]?.[1])).toMatch(/Pils · 16 oz case 10 → Pils · 16 oz case 7/);
    expect(String(model.events[1]?.[1])).toMatch(/customer cut/);
  });

  it("the Order inventory record is OrderView with the picked-restock mock", () => {
    const screen = SCREENS.find((s) => s.name === "Order");
    expect(screen, "Order screen").toBeTruthy();
    expect(isValidElement(screen!.body)).toBe(true);
    const body = screen!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(OrderView);
    expect(body.props.model).toBe(ORDER_PICKED_RESTOCK);
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
