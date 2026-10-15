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
import { toOrderViewProps, type OrderSnapshot } from "../lib/mgr/order-view";

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

  it("shows a line's shortage reason to staff (#624)", () => {
    const lines = orderPickedRestock.lines.map((l) => l.id === "l-pils" ? { ...l, short_reason: "one case crushed" } : l);
    const model = toOrderViewProps({ ...orderPickedRestock, lines });
    expect(model.lines[1]?.detail).toMatch(/ · short: one case crushed$/);
    expect(model.lines[0]?.detail).not.toMatch(/short/);
  });

  it("marks an order changed after pick (#811) and draws nothing when it was not", () => {
    const changed = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "confirmed" as const, needs_restock: false, repick_since: "2026-09-02T14:00:00.000Z" } };
    const model = toOrderViewProps(changed);
    expect(model.repickNote).toMatch(/^Changed after pick/);
    const html = renderToStaticMarkup(createElement(OrderView, { model }));
    expect(html).toContain("changed after pick");
    expect(html).toContain("the rest is already staged");
    expect(toOrderViewProps(orderPickedRestock).repickNote).toBeUndefined();
    expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(orderPickedRestock) }))).not.toContain("changed after pick");
  });

  it("says Pickup on a pickup order and nothing otherwise", () => {
    const pickup = { ...orderPickedRestock, order: { ...orderPickedRestock.order, pickup: true } };
    expect(toOrderViewProps(pickup).pickup).toBe(true);
    expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(pickup) }))).toContain("Pickup");
    expect(toOrderViewProps(orderPickedRestock).pickup).toBe(false);
    expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(orderPickedRestock) }))).not.toContain("Pickup");
  });

  it("a cancelled order that was changed after pick carries no re-pick note (#811)", () => {
    const cancelled = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "cancelled" as const, repick_since: "2026-09-02T14:00:00.000Z" } };
    expect(toOrderViewProps(cancelled).repickNote).toBeUndefined();
  });

  describe("Cost line (#810 PR2)", () => {
    const shipped = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "shipped" as const, needs_restock: false } };
    const costLine = (cogs?: { cost_cents: number; revenue_cents: number; uncosted_qty: number; margin_pct: number | null }, snapshot: OrderSnapshot = shipped) =>
      toOrderViewProps({ ...snapshot, cogs }).costLine;

    it("shows cost and margin on a shipped order", () => {
      expect(costLine({ cost_cents: 150000, revenue_cents: 360000, uncosted_qty: 0, margin_pct: 58.3 })).toBe("$1,500.00 · margin 58.3%");
      const html = renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps({ ...shipped, cogs: { cost_cents: 150000, revenue_cents: 360000, uncosted_qty: 0, margin_pct: 58.3 } }) }));
      expect(html).toContain("$1,500.00 · margin 58.3%");
    });

    it("withholds the margin and names the gap while any unit has no cost", () => {
      expect(costLine({ cost_cents: 1000, revenue_cents: 24000, uncosted_qty: 2, margin_pct: null })).toBe("$10.00 · 2 units without cost, margin withheld");
    });

    it("draws nothing without get_order_cogs data or before the order ships", () => {
      expect(costLine(undefined)).toBeUndefined();
      expect(costLine({ cost_cents: 1000, revenue_cents: 24000, uncosted_qty: 0, margin_pct: 95.8 }, orderPickedRestock)).toBeUndefined();
      expect(renderToStaticMarkup(createElement(OrderView, { model: toOrderViewProps(shipped) }))).not.toContain("margin");
    });

    it("the live page asks only roles that may run get_order_cogs", () => {
      expect(readFileSync(PAGE, "utf8")).toMatch(/canRun\(ctx, "get_order_cogs"\)/);
    });
  });

  it("a confirmed order with staged beer still offers Put back (#811)", () => {
    const mixed = { ...orderPickedRestock, order: { ...orderPickedRestock.order, status: "confirmed" as const, repick_since: "2026-09-02T14:00:00.000Z" } };
    const model = toOrderViewProps(mixed);
    expect(model.putBackHref).toBe("#");
    expect(model.next).toBe("Next: put back");
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
