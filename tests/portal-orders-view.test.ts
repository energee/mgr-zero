// tests/portal-orders-view.test.ts — portal Order history and Order detail
// adapters plus view HTML. Fixtures are portal_orders / portal_order
// snapshots; this file does not import SCREENS or read app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PortalOrderView } from "../components/mgr/views/portal-order";
import { PortalOrdersView } from "../components/mgr/views/portal-orders";
import { RIDGELINE, SKU_HAZY, SKU_PILS } from "../lib/mgr/fixtures/demo";
import { portalOrderShipped, portalOrdersList } from "../lib/mgr/fixtures/portal-orders";
import { toPortalOrderViewProps } from "../lib/mgr/portal-order-view";
import { toPortalOrdersViewProps } from "../lib/mgr/portal-orders-view";
import { money } from "../lib/mgr/money";

const htmlOf = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(createElement("div", null, node));

describe("Order history view", () => {
  it("maps portal_orders rows through buyerStatus, Reorder on shipped, nav elsewhere", () => {
    const model = toPortalOrdersViewProps(portalOrdersList);
    expect(model.subtitle).toBe(RIDGELINE.name);
    expect(model.rows.map((r) => r.title)).toEqual(["ORD-0231", "ORD-0225", "ORD-0221"]);
    expect(model.rows[0]?.detail).toMatch(/Confirmed · ships 2026-09-10/);
    expect(model.rows[0]?.verb).toBeUndefined();
    expect(model.rows[0]?.href).toMatch(/\/portal\/orders\//);
    expect(model.rows[1]?.title).toBe("ORD-0225");
    expect(model.rows[1]?.verb).toBe("Reorder");
    expect(model.rows[1]?.actionHref).toBe(`/portal?reorder=${portalOrdersList.orders[1].id}`);
    expect(model.rows[1]?.detail).toMatch(/Shipped/);
    expect(model.rows[2]?.warning).toBe(true);
    expect(model.rows[2]?.detail).toMatch(/adjusted · 2 cases short/);
    expect(model.rows[2]?.verb).toBe("Reorder");
    expect(model.info).toMatch(/Demo Brewing/);
  });

  it("sums line money when unit_price_cents is present and omits it otherwise", () => {
    const withPrices = toPortalOrdersViewProps(portalOrdersList);
    expect(withPrices.rows[0]?.detail).toContain(money(4 * SKU_HAZY.unit_price_cents + 6 * SKU_PILS.unit_price_cents + 4 * 3000));
    const bare = toPortalOrdersViewProps({
      customerName: RIDGELINE.name,
      breweryName: "Demo Brewing",
      orders: [{
        id: portalOrdersList.orders[0]!.id,
        order_no: 231,
        status: "confirmed",
        requested_ship_date: "2026-09-10",
        order_lines: [{ id: "l1", qty_ordered: 4, qty_shipped: null }],
      }],
    });
    expect(bare.rows[0]?.detail).toBe("Confirmed · ships 2026-09-10");
    expect(bare.rows[0]?.detail).not.toMatch(/\$/);
  });

  it("names an empty list without inventing rows", () => {
    const model = toPortalOrdersViewProps({ customerName: RIDGELINE.name, breweryName: "Demo Brewing", orders: [] });
    expect(model.empty).toBe("No orders yet. Start one from Order.");
    expect(model.rows).toEqual([]);
  });

  it("renders Reorder, ORD-0225, and buyer status from the view", () => {
    const html = htmlOf(createElement(PortalOrdersView, { model: toPortalOrdersViewProps(portalOrdersList) }));
    expect(html).toMatch(/>Reorder</);
    expect(html).toMatch(/ORD-0225/);
    expect(html).toMatch(/Confirmed · ships 2026-09-10/);
    expect(html).toMatch(/Shipped/);
    expect(html).toContain(RIDGELINE.name);
    expect(html).not.toMatch(/→/);
    expect(html).not.toMatch(/href="\/portal/);
  });

  it("links rows when asked", () => {
    const html = htmlOf(createElement(PortalOrdersView, {
      model: toPortalOrdersViewProps(portalOrdersList),
      linkRows: true,
    }));
    expect(html).toMatch(/href="\/portal(?:\?reorder=[^"]*)?"/);
    expect(html).toMatch(/href="\/portal\/orders\//);
  });
});

describe("Order detail view", () => {
  it("maps portal_order onto buyer status, ship-to, lines, invoice, and Reorder", () => {
    const model = toPortalOrderViewProps(portalOrderShipped);
    expect(model.title).toBe("ORD-0225");
    expect(model.backHref).toBeUndefined();
    expect(model.status).toMatch(/Shipped/);
    expect(model.shipTo).toBe("Main · Phoenixville, PA");
    expect(model.reorder).toBe(true);
    expect(model.lines).toHaveLength(2);
    expect(model.lines[0]?.name).toBe(SKU_HAZY.name);
    expect(model.lines[0]?.detail).toBe("ordered 2 · shipped 2");
    expect(model.lines[0]?.amount).toBe(money(2 * SKU_HAZY.unit_price_cents));
    expect(model.lines[1]?.name).toBe(SKU_PILS.name);
    expect(model.invoice?.title).toBe("INV-1037");
    expect(model.invoice?.detail).toMatch(/paid 8\/29/);
    expect(model.po).toBeUndefined();
    expect(model.note).toBeUndefined();
    expect(model.adjusted).toBeUndefined();
  });

  it("puts PO, note, and adjusted copy on the model when present, and hides invoice/Reorder otherwise", () => {
    const model = toPortalOrderViewProps({
      order: {
        ...portalOrderShipped.order,
        status: "confirmed",
        po_number: "4471",
        note: "dock closed Mondays",
        requested_ship_date: "2026-09-10",
      },
      lines: portalOrderShipped.lines,
      events: [{ id: "e-adj", event: "lines_adjusted", payload: {}, created_at: "2026-08-26T12:00:00.000Z" }],
      shipment: null,
    });
    expect(model.status).toBe("Confirmed · ships 2026-09-10");
    expect(model.po).toBe("4471");
    expect(model.note).toBe("dock closed Mondays");
    expect(model.adjusted).toMatch(/adjusted this order/);
    expect(model.invoice).toBeUndefined();
    expect(model.reorder).toBe(false);
  });

  it("separates cancelled fulfillment from the unpaid invoice balance", () => {
    const model = toPortalOrderViewProps({
      ...portalOrderShipped,
      lines: [{ ...portalOrderShipped.lines[0], qty_ordered: 10, qty_shipped: 4, short_reason: "Two cases damaged during picking" }],
      shipment: {
        ...portalOrderShipped.shipment!,
        invoices: portalOrderShipped.shipment!.invoices.map((invoice) => ({
          ...invoice,
          paid_at: null,
          qbo_balance_cents: 4 * SKU_HAZY.unit_price_cents,
          qbo_total_cents: null,
          invoice_lines: [{ amount_cents: 4 * SKU_HAZY.unit_price_cents }],
        })),
      },
    });
    expect(model.lines[0]).toMatchObject({ detail: "ordered 10 · shipped 4", warning: true });
    expect(model.shortageExplanation).toMatch(/Two cases damaged during picking.*unshipped 6.*no units remain to ship/i);
    expect(model.shortageExplanation).not.toMatch(/nothing remains due/i);
    expect(model.invoice?.detail).toBe("unpaid");
    expect(model.invoice?.amount).toBe(money(4 * SKU_HAZY.unit_price_cents));
  });

  it("renders Reorder, ORD-0225, and buyer status from the view", () => {
    const html = htmlOf(createElement(PortalOrderView, { model: toPortalOrderViewProps(portalOrderShipped) }));
    expect(html).toMatch(/>Reorder</);
    expect(html).toMatch(/ORD-0225/);
    expect(html).toMatch(/Shipped/);
    expect(html).toMatch(/INV-1037/);
    expect(html).toContain(SKU_HAZY.name);
    expect(html).not.toMatch(/→/);
  });

  it("the footer slot replaces the unlabeled Reorder button", () => {
    const footer: ReactNode = createElement("a", { href: "/portal" }, "Reorder");
    const html = htmlOf(createElement(PortalOrderView, {
      model: toPortalOrderViewProps(portalOrderShipped),
      footer,
    }));
    expect(html).toMatch(/href="\/portal(?:\?reorder=[^"]*)?"/);
    expect(html.match(/>Reorder</g)).toHaveLength(1);
  });
});

describe("inventory and live portal orders", () => {
  it("the Order history inventory record is PortalOrdersView", () => {
    const body = SCREENS.find((s) => s.name === "Order history")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Order history")!.body)).toBe(true);
    expect(body.type).toBe(PortalOrdersView);
    expect(body.props.model).toEqual(toPortalOrdersViewProps(portalOrdersList));
  });

  it("the Order detail inventory record is PortalOrderView", () => {
    const body = SCREENS.find((s) => s.name === "Order detail")!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(PortalOrderView);
    expect(body.props.model).toEqual(toPortalOrderViewProps(portalOrderShipped));
  });

  it("the live portal order pages mount the views with no second E.* tree", () => {
    const list = readFileSync("app/(portal)/portal/orders/page.tsx", "utf8");
    const detail = readFileSync("app/(portal)/portal/orders/[id]/page.tsx", "utf8");
    expect(list).toMatch(/<PortalOrdersView\b/);
    expect(list).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(detail).toMatch(/<PortalOrderView\b/);
    expect(detail).not.toMatch(/from "@\/components\/mgr\/e"/);
  });
});
