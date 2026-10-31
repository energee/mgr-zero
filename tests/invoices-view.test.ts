import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InvoicesView } from "../components/mgr/views/invoices";
import { QboStaffInvoiceLinkView } from "../components/mgr/views/accounting";
import { invoiceStatusOptions, toInvoiceListRow, type InvoiceListRecord } from "../lib/mgr/invoices-view";

const invoice: InvoiceListRecord = { id: "actual", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 0, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 104000, has_pending_qbo_push: false, qbo_invoice_id: "qbo-1042", local_paid_cents: 0, local_credit_cents: 0, was_pushed_to_qbo: false, customers: { name: "Actual customer" } };

it("nets local credit without hiding excess or calling it overdue", () => {
  const ledger = { ...invoice, qbo_invoice_id: null, was_pushed_to_qbo: false, qbo_balance_cents: null, local_credit_cents: 20000 };
  const partial = toInvoiceListRow(ledger, ["sales"], false, "UTC");
  expect(partial.balance.cents).toBe(84000);
  expect(partial.paymentBalanceCents).toBe(84000);
  const settled = toInvoiceListRow({ ...ledger, local_paid_cents: 84000, paid_at: "2026-10-20T00:00:00Z" }, ["sales"], false, "UTC");
  expect(settled.overdue).toBe(false);
  const excess = toInvoiceListRow({ ...ledger, local_paid_cents: 104000, paid_at: "2026-10-20T00:00:00Z" }, ["sales"], false, "UTC");
  expect(excess.balance.cents).toBe(-20000);
  expect(excess.paymentBalanceCents).toBeNull();
  expect(excess.overdue).toBe(false);
});
it("keeps structured identity, money, payment, and accounting facts separate", () => {
  const row = toInvoiceListRow(invoice, ["admin"], true, "America/New_York");
  expect(row.document.number).toBe("INV-1042");
  expect(row.document.kind).toBe("invoice");
  expect(row.customer).toBe("Actual customer");
  expect(row.total.cents).toBe(104000);
  expect(row.balance.cents).toBe(0);
  expect(row.balance.value).toBe("$0.00");
  expect(row.payment).toBe("Settled / no cash payment recorded");
  expect(row.accounting).toBeNull();
  expect(row.localSubtotal).toBeNull();
  expect(toInvoiceListRow({ ...invoice, customers: null }, ["admin"], true, "America/New_York").customer).toBe("Customer unavailable");
  const credit = toInvoiceListRow({ ...invoice, kind: "credit_memo", invoice_no: 12, total_cents: -18000, due_on: null, qbo_balance_cents: null }, ["admin"], true, "America/New_York");
  expect(credit.document).toEqual({ number: "CM-0012", kind: "credit_memo" });
  expect(credit.total.cents).toBe(-18000);
  expect(credit.balance.cents).toBeNull();
  expect(credit.balance.value).not.toBe(row.balance.value);
  expect(credit.payment).toBe("Credit memo");
  expect(credit.due.day).toBeNull();
});

it("preserves current totals, credit settlement, and voided invoices without inventing payment or URLs", () => {
  expect(toInvoiceListRow(invoice, ["admin"], true, "America/New_York").href).toBeUndefined();
  const drift = toInvoiceListRow({ ...invoice, qbo_accountant_drift: true }, ["admin"], true, "America/New_York");
  expect(drift.localSubtotal?.cents).toBe(98000);
  expect(drift.total.cents).toBe(104000);
  expect(drift.accounting).toMatch(/review/i);
  const voided = toInvoiceListRow({ ...invoice, paid_at: "2026-09-01", qbo_remote_state: "voided" }, ["admin"], false, "America/New_York");
  expect(voided.payment).toBe("Not paid");
  expect(voided.accounting).toMatch(/voided/i);
  expect(voided.quickbooksHref).toBeNull();
});

it("hands a rejected push's balance to MGR's ledger and keeps the mapping fix (#1045)", () => {
  // A rejected push created no QuickBooks document, so the ledger owns the balance.
  const failed = { ...invoice, qbo_invoice_id: null, qbo_sync_status: "push_failed" as const, qbo_sync_error: "QuickBooks rejected the invoice", qbo_balance_cents: null };
  const row = toInvoiceListRow(failed, ["admin"], true, "America/New_York");
  expect(row.needsMapping).toBe(true);
  expect(row.payment).toBe("Unpaid");
  expect(row.balance).toEqual({ cents: 104000, value: "$1,040.00" });
  expect(row.accounting).toContain(failed.qbo_sync_error);
  expect(toInvoiceListRow(failed, ["sales"], true, "America/New_York").needsMapping).toBe(true);
  expect(toInvoiceListRow(failed, ["admin"], false, "America/New_York").needsMapping).toBe(false);
  expect(toInvoiceListRow(failed, ["warehouse"], true, "America/New_York").needsMapping).toBe(false);
  expect(toInvoiceListRow(failed, ["warehouse", "sales"], true, "America/New_York").needsMapping).toBe(true);
  const deleted = toInvoiceListRow({ ...invoice, qbo_remote_state: "deleted" }, ["admin"], true, "America/New_York");
  expect(deleted.payment).toBe("Payment status unavailable");
  expect(deleted.accounting).toMatch(/deleted/i);
  expect(deleted.needsMapping).toBe(false);
});

it("preserves unknown push outcomes and exact-request recovery while disconnected", () => {
  const pending = { ...invoice, qbo_sync_status: "pending" as const, has_pending_qbo_push: true, qbo_balance_cents: null };
  const connected = toInvoiceListRow(pending, ["warehouse", "sales"], true, "UTC");
  const disconnected = toInvoiceListRow(pending, ["warehouse", "sales"], false, "UTC");
  expect(connected.accounting).toMatch(/unknown.*same request/i);
  expect(disconnected.accounting).toMatch(/unknown.*reconnect.*exact saved request/i);
  expect(disconnected.needsMapping).toBe(false);
  expect(disconnected.balance.cents).toBeNull();
  expect(disconnected.payment).not.toBe("Paid");
  expect(toInvoiceListRow(pending, ["warehouse"], false, "UTC").accounting).not.toMatch(/retry|request/i);
});

it("offers an existing verified QuickBooks link to the union of Admin and Sales roles", () => {
  const link = { href: "https://app.qbo.intuit.com/app/invoice?txnId=7&companyId=9341", reason: null };
  const edited = { ...invoice, qbo_accountant_drift: true, quickbooks_link: link };
  expect(toInvoiceListRow(edited, ["admin"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, ["sales"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, ["warehouse", "sales"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, ["warehouse", "brewer"], true, "UTC").quickbooksHref).toBeNull();
  expect(toInvoiceListRow({ ...edited, qbo_accountant_drift: false }, ["admin"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow({ ...edited, quickbooks_link: { href: null, reason: "The remote invoice identity is unavailable." } }, ["admin"], true, "UTC").quickbooksHref).toBeNull();
});

it("keeps payment meanings distinct without treating a legacy marker or zero balance as cash evidence", () => {
  const paid = { ...invoice, paid_at: "2026-09-12T00:30:00Z", qbo_cash_collected_cents: 104000 };
  expect(toInvoiceListRow(paid, ["admin"], true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow({ ...paid, qbo_accountant_drift: true }, ["admin"], true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow(paid, ["warehouse"], true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow({ ...paid, qbo_cash_collected_cents: 50000 }, ["admin"], true, "UTC").payment).toBe("Settled / $500.00 cash received");
  expect(toInvoiceListRow({ ...paid, qbo_cash_collected_cents: 0 }, ["admin"], true, "UTC").payment).toBe("Settled / no cash payment recorded");
  expect(toInvoiceListRow({ ...invoice, qbo_cash_collected_cents: 50000, qbo_balance_cents: 54000 }, ["admin"], true, "UTC").payment).toBe("Partially paid");
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: 104000 }, ["admin"], true, "UTC").payment).toBe("Unpaid");
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: -100 }, ["admin"], true, "UTC").payment).toBe("Credit balance");
  expect(toInvoiceListRow({ ...paid, qbo_balance_cents: -100 }, ["admin"], true, "UTC").payment).toBe("Credit balance");
  expect(toInvoiceListRow({ ...invoice, written_off_at: "2026-09-12" }, ["admin"], true, "UTC").payment).toBe("Written off");
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: null }, ["admin"], true, "UTC").payment).toBe("Payment status unavailable");
});

it("formats the date-only due day without a timezone conversion", () => {
  const unpaid = toInvoiceListRow({ ...invoice, qbo_balance_cents: 104000 }, ["admin"], true, "America/New_York", new Date("2026-09-01T12:00:00Z"));
  expect(unpaid.due.day).toBe("2026-09-12");
  expect(unpaid.due.value).toBe("Sep 12, 2026");
  expect(unpaid.overdue).toBe(false);
});

it("marks outstanding invoices overdue only after the brewery-local due day", () => {
  const now = new Date("2026-09-13T02:00:00Z");
  const owed = { ...invoice, qbo_balance_cents: 104000 };
  expect(toInvoiceListRow(owed, ["admin"], true, "UTC", now).overdue).toBe(true);
  expect(toInvoiceListRow(owed, ["admin"], true, "America/New_York", now).overdue).toBe(false);
  for (const change of [{ qbo_balance_cents: 0 }, { qbo_balance_cents: -100 }, { paid_at: "2026-09-12", qbo_balance_cents: 0 }, { written_off_at: "2026-09-12" }, { qbo_remote_state: "voided" as const }, { qbo_remote_state: "deleted" as const }, { kind: "credit_memo" as const }, { due_on: null }]) {
    expect(toInvoiceListRow({ ...owed, ...change }, ["admin"], true, "UTC", now).overdue).toBe(false);
  }
});

it("#1025 does not mark an unknown balance overdue, while a rejected push's ledger balance can be (#1045)", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const failed = toInvoiceListRow({ ...invoice, qbo_invoice_id: null, qbo_sync_status: "push_failed", qbo_sync_error: "rejected", qbo_balance_cents: null }, ["admin"], true, "UTC", now);
  expect(failed.payment).toBe("Unpaid");
  expect(failed.overdue).toBe(true);
  const unknownPush = toInvoiceListRow({ ...invoice, qbo_invoice_id: null, qbo_sync_status: "pending", has_pending_qbo_push: true, qbo_balance_cents: null }, ["admin"], true, "UTC", now);
  expect(unknownPush.payment).toBe("Payment status unavailable");
  expect(unknownPush.overdue).toBe(false);
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: null }, ["admin"], true, "UTC", now).overdue).toBe(false);
});

describe("an invoice whose balance MGR's payment ledger owns (#1045)", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const local: InvoiceListRecord = { ...invoice, qbo_invoice_id: null, qbo_sync_status: "pending", qbo_balance_cents: null, qbo_cash_collected_cents: 0 };
  const row = (change: Partial<InvoiceListRecord> = {}, connected = true) => toInvoiceListRow({ ...local, ...change }, ["admin"], connected, "UTC", now);

  it("reads Unpaid, Partially paid or Paid from the ledger's balance", () => {
    expect(row().payment).toBe("Unpaid");
    expect(row().balance).toEqual({ cents: 104000, value: "$1,040.00" });
    const partial = row({ local_paid_cents: 40000 });
    expect(partial.payment).toBe("Partially paid");
    expect(partial.balance).toEqual({ cents: 64000, value: "$640.00" });
    const paid = row({ local_paid_cents: 104000, paid_at: "2026-09-30T04:00:00Z" });
    expect(paid.payment).toBe("Paid");
    expect(paid.balance).toEqual({ cents: 0, value: "$0.00" });
  });

  it("is Overdue past its due day until it is paid", () => {
    expect(row().overdue).toBe(true);
    expect(row({ local_paid_cents: 40000 }).overdue).toBe(true);
    expect(row({ local_paid_cents: 104000, paid_at: "2026-09-30T04:00:00Z" }).overdue).toBe(false);
    expect(row({ due_on: "2026-10-04" }).overdue).toBe(false);
  });

  it("reads Written off, not Overdue, once written off, even partly paid (#1228)", () => {
    for (const change of [{}, { local_paid_cents: 40000 }]) {
      const writtenOff = row({ ...change, written_off_at: "2026-10-03T12:00:00Z" });
      expect(writtenOff.payment).toBe("Written off");
      expect(writtenOff.accounting).toBe("Written off in MGR");
      expect(writtenOff.overdue).toBe(false);
    }
  });

  it("captions a row with payments Payments recorded in MGR and offers no QuickBooks action", () => {
    expect(row({ local_paid_cents: 40000 }).accounting).toBe("Payments recorded in MGR");
    expect(row({ local_paid_cents: 40000 }, false).accounting).toBe("Payments recorded in MGR");
    const failed = row({ qbo_sync_status: "push_failed", qbo_sync_error: "QuickBooks rejected the invoice", local_paid_cents: 40000 });
    expect(failed.needsMapping).toBe(false);
    expect(failed.accounting).toBe("Payments recorded in MGR");
    expect(failed.quickbooksHref).toBeNull();
  });

  it("drops the caption when every payment is voided (Q8)", () => {
    const voided = row({ local_paid_cents: 0 });
    expect(voided.accounting).toBe("Not pushed to QuickBooks");
    expect(voided.payment).toBe("Unpaid");
  });

  it("reads a $0.00 invoice as No payment due, never overdue", () => {
    const zero = row({ total_cents: 0, subtotal_cents: 0 });
    expect(zero.payment).toBe("No payment due");
    expect(zero.balance).toEqual({ cents: 0, value: "$0.00" });
    expect(zero.overdue).toBe(false);
  });

  it("keeps an invoice pushed to a previous QuickBooks company unknown (Q4)", () => {
    const purged = row({ was_pushed_to_qbo: true });
    expect(purged.payment).toBe("Payment status unavailable");
    // An unknown balance says nothing rather than "Unavailable" on every row (#1516); never $0.00.
    expect(purged.balance).toEqual({ cents: null, value: null });
    expect(purged.overdue).toBe(false);
  });
});

it("heads the balance column Balance, since MGR's ledger can own it (#1045)", () => {
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [toInvoiceListRow(invoice, ["admin"], true, "UTC")], backHref: "/more" }));
  expect(html).toContain(">Balance<");
  expect(html).not.toContain("QuickBooks balance");
});

it("#1025 draws an ordinary row without an accounting caption, QuickBooks as a secondary action, and no dead link", () => {
  const ordinary = toInvoiceListRow(invoice, ["admin"], true, "UTC");
  const linked = { ...toInvoiceListRow({ ...invoice, id: "linked", quickbooks_link: { href: "https://app.qbo.intuit.com/app/invoice?txnId=7", reason: null } }, ["admin"], true, "UTC"), href: "/invoices/linked" };
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [ordinary, linked], backHref: "/more" }));
  expect(html).not.toContain("No accounting exception");
  expect(html).not.toContain('href="#"');
  expect(html).toContain('href="/invoices/linked"');
  expect(html).toMatch(/<a[^>]*data-variant="outline"[^>]*href="https:\/\/app\.qbo[^"]*"[^>]*>Open in QuickBooks/);
  const detail = renderToStaticMarkup(createElement(QboStaffInvoiceLinkView, { link: { href: "https://app.qbo.intuit.com/x", reason: null } }));
  expect(detail).toContain('data-variant="outline"');
});

it("reads a historical not_synced invoice as paid and not in QuickBooks, with nothing to fix", () => {
  const historical = { ...invoice, qbo_sync_status: "not_synced" as const, paid_at: "2025-08-14T16:00:00Z", due_on: "2025-08-14", qbo_balance_cents: null };
  const row = toInvoiceListRow(historical, ["admin"], true, "America/New_York", new Date("2026-10-15T12:00:00Z"));
  expect(row.accounting).toBe("Before the books opened");
  expect(row.payment).toBe("Paid");
  expect(row.overdue).toBe(false);
  expect(row.needsMapping).toBe(false);
});

it("#1030 starts the Accounting cell at the left edge its header uses", () => {
  const voided = toInvoiceListRow({ ...invoice, qbo_remote_state: "voided" }, ["admin"], false, "UTC");
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [voided], backHref: "/more" }));
  // The label may sit inside the header's sort button; the th carries the alignment.
  expect(html).toMatch(/<th[^>]*class="[^"]*text-left[^"]*"[^>]*>(?:(?!<\/th>)[\s\S])*>Accounting<(?:(?!<\/th>)[\s\S])*<\/th>/);
  expect(html).not.toContain("items-end");
});

it("#1135 shows the sync only while QuickBooks is connected, and writes the email note for staff", () => {
  const draw = (connected: boolean, canConnect = true) => renderToStaticMarkup(createElement(InvoicesView, {
    rows: [], connection: { connected, reconnect: true, detail: "QuickBooks status", canConnect, connectHref: "/settings/accounting" },
    sync: createElement("span", null, "live sync"),
  }));
  expect(draw(true)).toContain("live sync");
  expect(draw(true)).not.toContain("Payment status may be stale until QuickBooks is reconnected");
  const admin = draw(false);
  expect(admin).not.toContain("live sync");
  expect(admin).toContain('href="/settings/accounting"');
  expect(admin).toContain("Payment status may be stale until QuickBooks is reconnected and synced.");
  expect(admin).toContain("MGR can’t tell whether QuickBooks emailed an invoice.");
  expect(admin).not.toContain("invoice query");
  const sales = draw(false, false);
  expect(sales).not.toContain("live sync");
  expect(sales).toContain("Admin must connect");
  expect(sales).not.toContain('href="/settings/accounting"');
});

it("#1135 falls back to the shared sync view only while connected", () => {
  const draw = (connected: boolean) => renderToStaticMarkup(createElement(InvoicesView, {
    rows: [], connection: { connected, detail: "QuickBooks status", canConnect: true, connectHref: "/settings/accounting" },
  }));
  expect(draw(true)).toContain("Sync QuickBooks");
  expect(draw(false)).not.toContain("Sync QuickBooks");
});

it("explains where invoices come from without requiring QuickBooks (#1261)", () => {
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [] }));
  expect(html).toContain("No invoices yet");
  expect(html).toMatch(/Invoices show here after you ship an order/);
  expect(html).toMatch(/push them to QuickBooks or record payments in MGR/);
  expect(html).toContain("MGR can’t tell whether QuickBooks emailed an invoice.");
  expect(html).toContain(">Unavailable<");
});

describe("#1516 the register leads with its invoices", () => {
  const unknown = toInvoiceListRow({ ...invoice, was_pushed_to_qbo: true, qbo_invoice_id: null, qbo_balance_cents: null }, ["admin"], true, "UTC");
  const credit = toInvoiceListRow({ ...invoice, id: "cm", kind: "credit_memo", invoice_no: 12, total_cents: -18000, qbo_balance_cents: null }, ["admin"], true, "UTC");
  const draw = (props: Partial<Parameters<typeof InvoicesView>[0]> = {}) => renderToStaticMarkup(createElement(InvoicesView, {
    rows: [unknown, credit], connection: { connected: true, detail: "QuickBooks status", canConnect: true }, sync: "SYNC", ...props,
  }));

  it("leaves an unknown balance out and labels only credit memos under the number", () => {
    const html = draw();
    // Only the email-delivery note still reads Unavailable.
    expect(html.match(/>Unavailable</g)).toHaveLength(1);
    expect(html).not.toMatch(/>Invoice</);
    expect(html).toContain(">Credit memo<");
  });

  it("draws the invoices before the QuickBooks status and sync", () => {
    const html = draw();
    expect(html.indexOf("INV-1042")).toBeLessThan(html.indexOf("QuickBooks status"));
    expect(html.indexOf("INV-1042")).toBeLessThan(html.indexOf("SYNC"));
    // Disconnected, Connect is the next step and stays above the rows.
    const off = draw({ connection: { connected: false, reconnect: true, detail: "Needs reconnect", canConnect: true, connectHref: "/settings/accounting" } });
    expect(off.indexOf("Needs reconnect")).toBeLessThan(off.indexOf("INV-1042"));
  });

  it("offers All invoices and Unpaid, linked live and inert in the inventory", () => {
    expect(invoiceStatusOptions(true)).toEqual([
      { value: "all", label: "All invoices", href: "/invoices" },
      { value: "unpaid", label: "Unpaid", href: "/invoices?status=unpaid" },
    ]);
    expect(invoiceStatusOptions(false).every(option => option.href === undefined)).toBe(true);
    expect(draw()).toContain("All invoices");
  });

  it("says no unpaid invoices when the filter leaves none", () => {
    expect(draw({ rows: [], status: "unpaid" })).toContain("No unpaid invoices");
    expect(draw({ rows: [] })).toContain("No invoices yet");
  });
});

describe("Record payment from the register (#1506)", () => {
  // Never sent to QuickBooks, so MGR's payment ledger owns the balance (#1045).
  const ledger = { ...invoice, id: "ledger", qbo_invoice_id: null, qbo_sync_status: "pending" as const, qbo_balance_cents: null, local_paid_cents: 40000 };
  const balance = (overrides: Partial<InvoiceListRecord>) => toInvoiceListRow({ ...ledger, ...overrides }, ["admin"], false, "UTC").paymentBalanceCents;

  it("takes a payment on the same invoices as the invoice page, up to the rest of the balance", () => {
    expect(balance({})).toBe(64000);
    expect(balance({ local_paid_cents: 104000, paid_at: "2026-09-25T04:00:00Z" })).toBeNull();
    expect(balance({ written_off_at: "2026-09-30T15:00:00Z" })).toBeNull();
    expect(balance({ qbo_invoice_id: "qbo-1", qbo_balance_cents: 64000 })).toBeNull();
    expect(balance({ has_pending_qbo_push: true })).toBeNull();
    expect(balance({ total_cents: 0, subtotal_cents: 0, local_paid_cents: 0 })).toBeNull();
    expect(balance({ kind: "credit_memo", total_cents: -18000 })).toBeNull();
  });

  it("draws Record payment only on rows that take one: inert in the inventory, the caller's control live, none for null", () => {
    const rows = [toInvoiceListRow(ledger, ["admin"], false, "UTC"), toInvoiceListRow(invoice, ["admin"], false, "UTC")];
    // Once in the desk table and once in the phone list, for the one ledger row.
    expect(renderToStaticMarkup(createElement(InvoicesView, { rows })).match(/>Record payment</g)).toHaveLength(2);
    const live = renderToStaticMarkup(createElement(InvoicesView, { rows, recordPayment: row => `PAY-${row.id}` }));
    expect(live).toContain("PAY-ledger");
    expect(live).not.toContain("PAY-actual");
    expect(renderToStaticMarkup(createElement(InvoicesView, { rows, recordPayment: null }))).not.toContain("Record payment");
  });

  it("the live register mounts the invoice page's form for a viewer who may record payments", () => {
    const page = readFileSync("app/(app)/invoices/page.tsx", "utf8");
    expect(page).toMatch(/recordPayment=\{canRun\(ctx, "record_invoice_payment"\)/);
    expect(page).toMatch(/<RecordPaymentForm invoiceId=\{row\.id\} balanceCents=\{row\.paymentBalanceCents!\}/);
  });

  it("Record payment starts with the balance due (#1506)", () => {
    expect(readFileSync("app/(app)/invoices/[id]/payment-form.tsx", "utf8")).toMatch(/amount: dollarsInput\(balanceCents\)/);
  });

  it("Record payment on the invoice page starts on the customer's last payment method (#1506)", () => {
    expect(readFileSync("app/(app)/invoices/[id]/payment-form.tsx", "utf8")).toMatch(/method: lastMethod \?\? ""/);
    expect(readFileSync("app/(app)/invoices/[id]/page.tsx", "utf8")).toMatch(/<RecordPaymentForm [^>]*lastMethod=\{lastPaymentMethod\}/);
  });
});
