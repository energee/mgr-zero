// tests/orders-list-view.test.ts — Orders list and New order inventory share
// adapters with list_orders / form snapshots. Views own no sample data.
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// The live Status pick navigates with the app router; outside Next it needs a stand-in.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/orders" }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", roles: ["sales"], timeZone: "America/Los_Angeles" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ roles: ["sales"] }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/mgr/page-query", () => ({ requirePagePermission: vi.fn(), optionalPageQuery: async () => ({ customer: { name: "Ridgeline Tap Room" } }) }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: vi.fn(() => ({ data: { rows: ordersWorkList.orders, nextCursor: null }, error: null, dataUpdatedAt: 1, refetch: vi.fn() })) }));
import OrdersPage from "@/app/(app)/orders/page";
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { useCommandQuery } from "@/components/mgr/query-provider";
import { SCREENS } from "../components/mgr/screens";
import { NewOrderView } from "../components/mgr/views/new-order";
import { OrdersView } from "../components/mgr/views/orders-list";
import { newOrderDraft, ordersWorkList } from "../lib/mgr/fixtures/orders";
import { toNewOrderViewProps } from "../lib/mgr/new-order-view";
import { toOrdersListViewProps } from "../lib/mgr/orders-list-view";
import { ORDER_STATUSES, parseOrderStatus } from "../lib/mgr/order-status";

const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const html = (name: string) => renderToStaticMarkup(createElement("div", null, screen(name).body));

describe("Orders list view loop", () => {
  const verb = (row: { action?: { verb: string } }) => row.action?.verb ?? "Open";

  it.each([
    ["sales", ["Finish", "Confirm", "Open", "Open", "Open", "Open", "Open"]],
    ["warehouse", ["Open", "Open", "Pick", "Ship", "Put back", "Open", "Open"]],
    ["admin", ["Finish", "Confirm", "Pick", "Ship", "Put back", "Open", "Open"]],
  ])("offers only authorized actions for %s", (role, verbs) => {
    const states = ["draft", "submitted", "confirmed", "picked", "picked", "shipped", "cancelled"] as const;
    const rows = toOrdersListViewProps({ roles: [role], linked: true, orders: states.map((status, i) => ({ ...ordersWorkList.orders[0], id: String(i), status, needs_restock: i === 4 })) }).rows;
    expect(rows.map(verb)).toEqual(verbs);
    for (const [i, row] of rows.entries()) {
      // The order number always opens the order; Open would repeat it, so no action is drawn.
      expect(row.href).toBe(`/orders/${i}`);
      if (row.action) expect(row.action.href).toBe(`/orders/${i}${row.action.verb === "Confirm" ? "/confirm" : row.action.verb === "Put back" ? "/restock" : ""}`);
      // Lifecycle status stays its own fact whatever the action.
      expect(row.status).toBe(states[i]);
    }
  });

  it("keeps order facts separate: number, customer, requested date, status, restock", () => {
    const [submitted, , , , transfer] = toOrdersListViewProps({ ...ordersWorkList, roles: ["admin"] }).rows;
    expect(submitted).toMatchObject({ orderNo: "ORD-0231", customer: "Ridgeline Tap Room", shipDate: "Sep 10, 2026", status: "submitted", restock: false });
    // No customer join: the transfer fallback, never an invented destination.
    expect(transfer).toMatchObject({ orderNo: "Order", customer: null, shipDate: null });
    const staged = toOrdersListViewProps({ ...ordersWorkList, roles: ["admin"] }).rows.find((r) => r.restock)!;
    expect(staged.action?.verb).toBe("Put back");
  });

  it("prints a requested date as its calendar day and a missing one as null, never today", () => {
    const at = (requested_ship_date: string | null, order_no: number | null = 1) =>
      toOrdersListViewProps({ roles: ["sales"], orders: [{ ...ordersWorkList.orders[0], requested_ship_date, order_no }] }).rows[0]!;
    expect(at("2026-10-19").shipDate).toBe("Oct 19, 2026");
    expect(at(null).shipDate).toBeNull();
    // Before a number exists the row says "Order" (docNo's fallback).
    expect(at(null, null).orderNo).toBe("Order");
  });

  it("leaves inventory rows, actions, status options and Clear inert", () => {
    const model = toOrdersListViewProps({ ...ordersWorkList, roles: ["admin"], customer: "Ridgeline Tap Room", customerId: "c1" });
    expect(model.rows.every((r) => r.href === undefined && (r.action?.href === undefined))).toBe(true);
    expect(model.statusOptions.every((o) => o.href === undefined)).toBe(true);
    expect(model.customer).toEqual({ name: "Ridgeline Tap Room" });
  });

  it("offers every status in one Status pick; each keeps the customer and drops the cursor", () => {
    const model = toOrdersListViewProps({ roles: ["sales"], linked: true, status: "picked", customer: "Ridgeline Tap Room", customerId: "c1", orders: [] });
    expect(model.status).toBe("picked");
    expect(model.statusOptions.map((o) => o.label)).toEqual(["All states", "Draft", "Submitted", "Confirmed", "Picked", "Shipped", "Cancelled"]);
    expect(model.statusOptions[0]).toEqual({ value: "all", label: "All states", href: "/orders?customerId=c1" });
    expect(model.statusOptions[2]?.href).toBe("/orders?customerId=c1&status=submitted");
    // Clear removes only the customer scope.
    expect(model.customer).toEqual({ name: "Ridgeline Tap Room", clearHref: "/orders?status=picked" });
    expect(toOrdersListViewProps({ roles: ["sales"], linked: true, orders: [] })).toMatchObject({ status: "all", customer: undefined });
  });

  it("builds routable status choices from the live page while preserving and encoding its customer", async () => {
    const page = await OrdersPage({ searchParams: Promise.resolve({ status: "picked", customerId: "customer & partner", cursor: "older-page" }) });
    const list = OrdersClient(page.props);
    expect(list.props.model.statusOptions).toEqual([
      { value: "all", label: "All states", href: "/orders?customerId=customer+%26+partner" },
      ...ORDER_STATUSES.map((status) => ({
        value: status,
        label: status[0].toUpperCase() + status.slice(1),
        href: `/orders?customerId=customer+%26+partner&status=${status}`,
      })),
    ]);
    const unscopedPage = await OrdersPage({ searchParams: Promise.resolve({ status: "picked" }) });
    expect(OrdersClient(unscopedPage.props).props.model.statusOptions).toEqual([
      { value: "all", label: "All states", href: "/orders" },
      ...ORDER_STATUSES.map((status) => ({
        value: status,
        label: status[0].toUpperCase() + status.slice(1),
        href: `/orders?status=${status}`,
      })),
    ]);
  });

  it.each(ORDER_STATUSES)("takes the %s deep-link status through to list_orders and the controlled pick", async (status) => {
    const page = await OrdersPage({ searchParams: Promise.resolve({ status }) });
    expect(page.props.status).toBe(status);
    const list = OrdersClient(page.props);
    expect(useCommandQuery).toHaveBeenLastCalledWith("list_orders", { status, customerId: undefined, cursor: undefined });
    expect(list.props.model.status).toBe(status);
    expect(parseOrderStatus(status)).toBe(status);
  });

  it.each([
    undefined,
    "",
    "all",
    "bogus",
    "PICKED",
    ["picked"],
    ["picked", "shipped"],
    ["bogus", "picked"],
  ].map((status) => ({ status })))("ignores an invalid or repeated query status: $status", async ({ status }) => {
    expect(parseOrderStatus(status)).toBeUndefined();
    const page = await OrdersPage({ searchParams: Promise.resolve({ status, customerId: "c1" }) });
    expect(page.props.status).toBeUndefined();
    const list = OrdersClient(page.props);
    expect(useCommandQuery).toHaveBeenLastCalledWith("list_orders", { status: undefined, customerId: "c1", cursor: undefined });
    expect(list.props.model.status).toBe("all");
    expect(list.props.model.customer?.clearHref).toBe("/orders");
    expect(list.props.model.statusOptions[0]?.href).toBe("/orders?customerId=c1");
  });

  it("prints the ship date in the one date format, never ISO (#991)", () => {
    const model = toOrdersListViewProps({ roles: ["sales"], orders: [{ ...ordersWorkList.orders[0], requested_ship_date: "2026-09-14" }] });
    expect(model.rows[0]?.shipDate).toBe("Sep 14, 2026");
  });

  it("names an empty filtered list without inventing rows", () => {
    const model = toOrdersListViewProps({ roles: ["sales"], status: "shipped", orders: [] });
    expect(model.empty?.title).toBe("No shipped orders");
    expect(model.rows).toEqual([]);
  });

  it("names the customer filter in the empty state (#768)", () => {
    expect(toOrdersListViewProps({ roles: ["sales"], customer: "Ridgeline Tap Room", orders: [] }).empty?.title).toBe("No orders for Ridgeline Tap Room");
    expect(toOrdersListViewProps({ roles: ["sales"], status: "shipped", customer: "Ridgeline Tap Room", orders: [] }).empty?.title).toBe("No shipped orders for Ridgeline Tap Room");
  });

  it("offers New order inside the true empty state only for a role allowed to create (#1129)", () => {
    for (const role of ["admin", "sales", "warehouse"] as const) {
      const list = OrdersClient({ roles: [role], timeZone: "UTC" });
      const model = toOrdersListViewProps({ roles: [role], orders: [] });
      const markup = renderToStaticMarkup(createElement(OrdersView, { ...list.props, model }));
      const content = markup.match(/data-slot="empty-content"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
      if (role === "warehouse") expect(content).not.toContain("New order");
      else expect(content).toContain('href="/orders/new"');
    }
  });

  it("does not treat filtered, older, loading, or failed order lists as a true empty state (#1129)", () => {
    const createAction = createElement("a", { href: "/orders/new" }, "New order");
    const model = toOrdersListViewProps({ roles: ["sales"], orders: [] });
    const cases = [
      { model: { ...model, status: "shipped" as const } },
      { model: { ...model, customer: { name: "Ridgeline" } } },
      { model, pagination: { firstHref: "/orders" } },
      { model, listStatus: createElement("p", null, "Loading orders") },
      { model, listStatus: createElement("p", null, "Could not load orders") },
    ];
    for (const props of cases) {
      const markup = renderToStaticMarkup(createElement(OrdersView, { ...props, createAction }));
      expect(markup).not.toContain('data-slot="empty-content"');
    }
  });

  it("labels the customer filter with the customer's name even when no order matches (#768)", async () => {
    const page = await OrdersPage({ searchParams: Promise.resolve({ customerId: "c1" }) });
    expect(page.props.customerName).toBe("Ridgeline Tap Room");
    const html = renderToStaticMarkup(createElement(OrdersClient, { ...page.props }));
    expect(html).toMatch(/Customer: <strong[^>]*>Ridgeline Tap Room<\/strong>/);
    expect(html).toContain('href="/orders"');
  });

  it("draws a register: headed columns on the desk, the same facts labeled on the phone", () => {
    const html = renderToStaticMarkup(createElement(OrdersView, { model: toOrdersListViewProps({ ...ordersWorkList, roles: ["admin"], linked: true }) }));
    // A header is its text, whether plain or inside its sort button.
    const headers = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match => match[1].replace(/<[^>]*>/g, ""));
    expect(headers).toEqual(expect.arrayContaining(["Order", "Customer", "Requested ship date", "Status"]));
    expect(html).toContain(">Not scheduled<");
    expect(html).toContain(">Restock staged<");
    expect(html).toContain('href="/orders/00000000-0000-4000-8000-000000000231"');
    expect(html).not.toMatch(/>Open</);
  });

  it("the Orders inventory record is OrdersView painted from that fixture", () => {
    const body = screen("Orders").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Orders").body)).toBe(true);
    expect(body.type).toBe(OrdersView);
    expect(body.props.model).toEqual(toOrdersListViewProps(ordersWorkList));
  });

  it("the inventory list offers New order, the Status pick and the sales verbs only", () => {
    expect(html("Orders")).toMatch(/>Orders</);
    expect(html("Orders")).toMatch(/>New order</);
    expect(html("Orders")).toMatch(/>Status</);
    expect(html("Orders")).toMatch(/>Confirm</);
    expect(html("Orders")).not.toMatch(/>Put back</);
    expect(html("Orders")).toMatch(/>Finish</);
  });

  it("the live Orders page delegates to the shared view and freshness component", async () => {
    const page = await OrdersPage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(OrdersClient);
    const list = OrdersClient(page.props);
    expect(list.type).toBe(OrdersView);
    expect(list.props.model).toEqual(toOrdersListViewProps({ ...ordersWorkList, linked: true }));
    expect(renderToStaticMarkup(list.props.createAction)).toContain('href="/orders/new"');
    expect(list.props.feedback.type).toBe(QueryFeedback);
    expect(list.props.feedback.props.timeZone).toBe("America/Los_Angeles");
    const inventory = screen("Orders").body as typeof list;
    expect(inventory.props.feedback.type).toBe(QueryFeedback);
  });
});

describe("New order view loop", () => {
  it("maps the form snapshot onto picks, ATP lines, and Save draft", () => {
    const model = toNewOrderViewProps(newOrderDraft);
    expect(model.customer).toBe("Ridgeline Tap Room");
    expect(model.lines[1]?.warning).toBe(true);
    expect(model.lines[0]?.qty).toBe(4);
  });

  it("the New order inventory record is NewOrderView painted from that fixture", () => {
    const body = screen("New order").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(NewOrderView);
    expect(body.props.model).toEqual(toNewOrderViewProps(newOrderDraft));
  });

  it("the inventory sheet still uses the date picker and Save draft", () => {
    expect(html("New order")).toContain('data-slot="popover-trigger"');
    expect(html("New order")).toMatch(/>Save draft</);
    expect(html("New order")).toMatch(/>Add line</);
    expect(html("New order")).not.toContain("Last checked");
  });
});
