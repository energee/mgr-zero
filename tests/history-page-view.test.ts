import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { historyPage, pageCursor } from "@/lib/mgr/history-page";
import { HistoryNavigation } from "@/components/mgr/views/history-navigation";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";

it("offers More only with a next cursor and keeps filters and timestamp precision", () => {
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
  for (const count of [0, 5, 50]) {
    const last = historyPage({ rows: rows.slice(0, count), nextCursor: null }, "/orders", undefined);
    expect(last.pagination.moreHref).toBeUndefined();
    expect(renderToStaticMarkup(createElement(HistoryNavigation, last.pagination))).toBe("");
  }
  const html = renderToStaticMarkup(createElement(HistoryNavigation, page.pagination));
  expect(html).toContain("History pages");
  expect(html).toContain("Newest");
  expect(html).toContain("More");
});


it("all four inventory/live views mount the same continuation control", () => {
  const pagination = { moreHref: "/next", firstHref: "/newest" };
  const views = [
    createElement(OrdersView, { model: { subtitle: "", rows: [] }, pagination }),
    createElement(InvoicesView, { rows: [], pagination }),
    createElement(PortalOrdersView, { model: { subtitle: "", rows: [], info: "" }, pagination }),
    createElement(PortalInvoicesView, { model: { subtitle: "", rows: [] }, pagination }),
  ];
  for (const view of views) {
    const html = renderToStaticMarkup(view);
    expect(html).toContain('aria-label="History pages"');
    expect(html).toContain('href="/next"');
    expect(html).toContain('href="/newest"');
  }
});

it("reads only a well-formed single cursor from the URL; anything else opens the newest page", () => {
  const cursor = "2026-09-20T12:00:00.123456+00:00~0b9f3c1e-7d1a-4c8e-9a51-2f6d8e4b7c10";
  expect(pageCursor(cursor)).toBe(cursor);
  for (const bad of [undefined, "", "garbage", "2026-09-20~not-a-uuid", [cursor, cursor]]) expect(pageCursor(bad)).toBeUndefined();
});
