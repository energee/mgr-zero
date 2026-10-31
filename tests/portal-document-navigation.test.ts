import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatDate } from "@/lib/date-format";
const state = vi.hoisted(() => ({ kind: "invoice" as "invoice" | "credit_memo", paid: false }));
vi.mock("@/lib/portal", () => {
  const customer = { breweryId: "brewery", customerId: "buyer", customerName: "Buyer" };
  return { getActiveCustomer: async () => customer, getPortalContext: async () => ({ customer, ctx: { roles: ["customer"] } }) };
});
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ roles: ["customer"] }) }));
vi.mock("@/lib/commands/all", () => ({}));
vi.mock("@/lib/commands/use-command-form", () => ({ useCommandAction: () => ({ busy: false, error: "", run() {} }) }));
vi.mock("@/lib/commands/registry", () => ({ runCommand: async (name: string) => {
  if (name === "portal_invoice") return { invoice: { id: "invoice", invoice_no: 42, kind: state.kind, issued_on: "2026-09-08", due_on: "2026-10-08", paid_at: state.paid ? "2026-09-09T12:00:00Z" : null, qbo_balance_cents: state.kind === "invoice" && !state.paid ? 500 : 0, total_cents: state.kind === "credit_memo" ? -500 : 500 }, lines: [], brewery: { name: "Brewery", customer_phone: null } };
  if (name === "portal_orders") return { nextCursor: null, rows: ["draft", "shipped"].map(status => ({ id: status, order_no: 42, status, requested_ship_date: null, order_lines: [{ id: "line", qty_ordered: 4, qty_shipped: status === "shipped" ? 2 : null }] })) };
  throw new Error(name);
} }));
import InvoicePage from "@/app/(portal)/portal/invoices/[id]/page";
import OrdersPage from "@/app/(portal)/portal/orders/page";

it.each([{ kind: "invoice" as const, paid: false, status: "Unpaid" }, { kind: "invoice" as const, paid: true, status: "Paid" }, { kind: "credit_memo" as const, paid: false, status: "Credit" }])("retains $status document facts, history navigation and invoice-help entry", async ({ kind, paid, status }) => {
  state.kind = kind; state.paid = paid;
  const html = renderToStaticMarkup(await InvoicePage({ params: Promise.resolve({ id: "invoice" }), searchParams: Promise.resolve({}) }));
  expect(html).toMatch(/<button\b[^>]*\baria-haspopup="dialog"/);
  expect(html).toContain('href="/portal/invoices"');
  expect(html).toContain(formatDate("2026-09-08"));
  expect(html).toContain(`>${status}<`);
  if (kind === "credit_memo") {
    expect(html).not.toContain('action="/portal/invoices/invoice/pay"');
    expect(html).not.toContain('href="/portal/invoices/invoice/pay"');
    expect(html).not.toContain(">Paid<");
    expect(html).not.toContain(formatDate("2026-10-08"));
  }
});
it("keeps each history detail link alongside exact draft and short-shipped reorder actions", async () => {
  const html = renderToStaticMarkup(await OrdersPage({ searchParams: Promise.resolve({}) }));
  for (const [id, action] of [["draft", "draft"], ["shipped", "reorder"]]) {
    expect(html).toContain(`href="/portal/orders/${id}"`);
    expect(html).toContain(`href="/portal?${action}=${id}"`);
  }
});

it("disables payment submission after an unavailable handoff while retaining history and help entry", async () => {
  state.kind = "invoice"; state.paid = false;
  const available = renderToStaticMarkup(await InvoicePage({ params: Promise.resolve({ id: "invoice" }), searchParams: Promise.resolve({}) }));
  expect(available).toContain('method="post"');
  expect(available).toContain('action="/portal/invoices/invoice/pay"');
  const page = await InvoicePage({ params: Promise.resolve({ id: "invoice" }), searchParams: Promise.resolve({ payment: "unavailable" }) });
  const html = renderToStaticMarkup(page);
  expect(html).not.toContain('action="/portal/invoices/invoice/pay"');
  expect(html).not.toContain('href="/portal/invoices/invoice/pay"');
  expect(html).toContain('href="/portal/invoices"');
  expect(html).toMatch(/<button\b[^>]*\baria-haspopup="dialog"/);
});
