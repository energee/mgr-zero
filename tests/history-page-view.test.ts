import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { numberedHistoryPage, pageNumber, pageSize } from "@/lib/mgr/history-page";
import { FinishedGoodsView } from "@/components/mgr/views/finished-goods";
import { InventoryDetailView } from "@/components/mgr/views/inventory-detail";
import { INVENTORY_DETAIL } from "@/lib/mgr/fixtures/inventory-detail";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";

it("keeps batch groups independent and resets only the resized group's page", () => {
  const { pagination } = numberedHistoryPage({ rows: [], nextCursor: null, total: 612 }, "/batches", 4, 25, { cancelledPage: "2" }, "completedPage");
  expect(pagination.previousHref).toBe("/batches?cancelledPage=2&completedLimit=25&completedPage=3");
  expect(pagination.sizeHrefs["10"]).toBe("/batches?cancelledPage=2&completedLimit=10&completedPage=1");
  expect(pageNumber("3")).toBe(3);
  for (const value of ["1.5", "0", "-2", ["2"], "1000001"]) expect(pageNumber(value)).toBe(1);
  expect(pageSize("100")).toBe(100);
  for (const value of [undefined, "0", ["10"], "201"]) expect(pageSize(value)).toBe(50);
});


it("shows direct page links, ellipses and an accessible current page on staff and portal lists", () => {
  const { pagination } = numberedHistoryPage({ rows: [], nextCursor: null, total: 451 }, "/list", 5, 50);
  const views = [
    createElement(OrdersView, { model: { rows: [], status: "all", statusOptions: [] }, pagination }),
    createElement(InvoicesView, { rows: [], pagination }),
    createElement(PortalOrdersView, { model: { rows: [], info: "" }, pagination }),
    createElement(PortalInvoicesView, { model: { rows: [] }, pagination }),
    createElement(FinishedGoodsView, { model: { rows: [] }, movements: { rows: [] }, pagination }),
    createElement(InventoryDetailView, { model: INVENTORY_DETAIL, pagination }),
  ];
  for (const view of views) {
    const html = renderToStaticMarkup(view);
    expect(html).toContain('aria-label="History pages"');
    for (const page of [1, 4, 5, 6, 10]) expect(html).toContain(`href="/list?page=${page}"`);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-slot="pagination-ellipsis"');
    expect(html).not.toContain('href="/list?page=8"');
  }
});

it("does not offer an out-of-range Next or Previous", () => {
  const result = { rows: [], nextCursor: null, total: 51 };
  expect(numberedHistoryPage(result, "/orders", 1, 50).pagination.previousHref).toBeUndefined();
  expect(numberedHistoryPage(result, "/orders", 2, 50).pagination.nextHref).toBeUndefined();
});
