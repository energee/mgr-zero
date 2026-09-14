// tests/orders-list-view.test.ts — Orders list and New order inventory share
// adapters with list_orders / form snapshots. Views own no sample data.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery", role: "sales" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ role: "sales" }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/mgr/page-query", () => ({ requirePagePermission: vi.fn() }));
vi.mock("@/components/mgr/query-provider", () => ({ useCommandQuery: () => ({ data: ordersWorkList.orders, error: null, dataUpdatedAt: 1, refetch: vi.fn() }) }));
import OrdersPage from "@/app/(app)/orders/page";
import { OrdersClient } from "@/app/(app)/orders/orders-client";
import { QueryFeedback } from "@/components/mgr/query-feedback";
import { SCREENS } from "../components/mgr/screens";
import { NewOrderView } from "../components/mgr/views/new-order";
import { OrdersView } from "../components/mgr/views/orders-list";
import { newOrderDraft, ordersWorkList } from "../lib/mgr/fixtures/orders";
import { toNewOrderViewProps } from "../lib/mgr/new-order-view";
import { toOrdersListViewProps } from "../lib/mgr/orders-list-view";

const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const html = (name: string) => renderToStaticMarkup(createElement("div", null, screen(name).body));

describe("Orders list view loop", () => {
  it("maps list_orders-shaped rows through nextAction", () => {
    const model = toOrdersListViewProps(ordersWorkList);
    expect(model.subtitle).toBe("sales default");
    expect(model.rows.map((r) => r.verb)).toEqual(["Confirm", "Put back", "Pick", "Finish"]);
    expect(model.rows[0]?.title).toMatch(/^ORD-0231 ·/);
    expect(model.rows[1]?.warning).toBe(true);
    expect(model.rows[1]?.verb).toBe("Put back");
  });

  it("names an empty filtered list without inventing rows", () => {
    const model = toOrdersListViewProps({ role: "sales", status: "shipped", orders: [] });
    expect(model.empty?.title).toBe("No shipped orders");
    expect(model.rows).toEqual([]);
  });

  it("the Orders inventory record is OrdersView painted from that fixture", () => {
    const body = screen("Orders").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Orders").body)).toBe(true);
    expect(body.type).toBe(OrdersView);
    expect(body.props.model).toEqual(toOrdersListViewProps(ordersWorkList));
  });

  it("the inventory list still offers New order and the next-action verbs", () => {
    expect(readFileSync("components/mgr/views/orders-list.tsx", "utf8")).toMatch(/import \{ WORK_CHIPS, WORK_TABS \} from "@\/lib\/mgr\/work-view"/);
    expect(html("Orders")).toMatch(/>Orders</);
    expect(html("Orders")).toMatch(/>New order</);
    expect(html("Orders")).toMatch(/>Confirm</);
    expect(html("Orders")).toMatch(/>Put back</);
    expect(html("Orders")).toMatch(/>Pick</);
    expect(html("Orders")).toMatch(/>Finish</);
  });

  it("the live Orders page delegates to the shared view and freshness component", async () => {
    const page = await OrdersPage({ searchParams: Promise.resolve({}) });
    expect(page.type).toBe(OrdersClient);
    const list = OrdersClient(page.props);
    expect(list.type).toBe(OrdersView);
    expect(list.props.model).toEqual(toOrdersListViewProps(ordersWorkList));
    expect(renderToStaticMarkup(list.props.createAction)).toContain('href="/orders/new"');
    expect(list.props.feedback.type).toBe(QueryFeedback);
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
    expect(html("New order")).toContain("Last checked");
  });
});
