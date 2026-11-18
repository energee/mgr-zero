import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { historyPage, numberedHistoryPage, pageCursor, pageNumber, pageSize } from "@/lib/mgr/history-page";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";

it("preserves movement history cursor precision and filters", () => {
  const rows = Array.from({ length: 50 }, (_, n) => ({ id: String(n), created_at: "2026-09-20T12:00:00.123456+00:00" }));
  const open = `${rows[0].created_at}~0b9f3c1e-7d1a-4c8e-9a51-2f6d8e4b7c10`;
  const nextCursor = `${rows[49].created_at}~49`;
  const page = historyPage({ rows, nextCursor }, "/orders", open, { status: "draft", customerId: "buyer", unused: undefined });
  expect(page.rows).toEqual(rows);
  const url = new URL(page.pagination.moreHref!, "http://localhost");
  expect(url.searchParams.get("cursor")).toBe(nextCursor);
  expect(url.searchParams.get("status")).toBe("draft");
  expect(url.searchParams.get("customerId")).toBe("buyer");
  expect(page.pagination.firstHref).toBe("/orders?status=draft&customerId=buyer");
  expect(historyPage({ rows, nextCursor }, "/orders", undefined).pagination.firstHref).toBeUndefined();
});

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


it("reads only a well-formed single cursor from the URL; anything else opens the newest page", () => {
  const cursor = "2026-09-20T12:00:00.123456+00:00~0b9f3c1e-7d1a-4c8e-9a51-2f6d8e4b7c10";
  expect(pageCursor(cursor)).toBe(cursor);
  for (const bad of [undefined, "", "garbage", "2026-09-20~not-a-uuid", [cursor, cursor]]) expect(pageCursor(bad)).toBeUndefined();
});
