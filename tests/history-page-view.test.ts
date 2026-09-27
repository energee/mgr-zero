import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { historyPage } from "@/lib/mgr/history-page";
import { HistoryNavigation } from "@/components/mgr/views/history-navigation";
import { OrdersView } from "@/components/mgr/views/orders-list";
import { InvoicesView } from "@/components/mgr/views/invoices";
import { PortalOrdersView } from "@/components/mgr/views/portal-orders";
import { PortalInvoicesView } from "@/components/mgr/views/portal-invoices";

it("offers More only with a lookahead row, keeps filters and timestamp precision", () => {
  const rows = Array.from({ length: 51 }, (_, n) => ({ id: String(n), created_at: "2026-09-20T12:00:00.123456+00:00" }));
  const page = historyPage(rows, "/orders", { status: "draft", customerId: "buyer", unused: undefined });
  expect(page.rows).toEqual(rows.slice(0, 50));
  const url = new URL(page.moreHref!, "http://localhost");
  expect(url.searchParams.get("cursor")).toBe(`${rows[49].created_at}~49`);
  expect(url.searchParams.get("status")).toBe("draft");
  expect(url.searchParams.get("customerId")).toBe("buyer");
  expect(page.firstHref).toBe("/orders?status=draft&customerId=buyer");
  for (const count of [0, 5, 50]) {
    const last = historyPage(rows.slice(0, count), "/orders");
    expect(last.moreHref).toBeUndefined();
    expect(renderToStaticMarkup(createElement(HistoryNavigation, { moreHref: last.moreHref }))).toBe("");
  }
  const html = renderToStaticMarkup(createElement(HistoryNavigation, page));
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
