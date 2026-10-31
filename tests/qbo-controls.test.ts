import { describe, expect, it } from "vitest";
import { toInvoiceListRow } from "@/lib/mgr/invoices-view";

describe("QuickBooks control boundaries", () => {
  it("keeps accounting review separate from payment and current totals", () => {
    const row = toInvoiceListRow({
      id: "inv", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null,
      qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live",
      qbo_balance_cents: 98000, qbo_cash_collected_cents: 0, qbo_accountant_drift: true,
      written_off_at: null, subtotal_cents: 98000, total_cents: 99000, has_pending_qbo_push: false,
      qbo_invoice_id: "qbo-1042", local_paid_cents: 0, local_credit_cents: 0, was_pushed_to_qbo: false,
      customers: { name: "Ridgeline" }, quickbooks_link: { href: "https://app.qbo.intuit.com/app/invoice?txnId=7&companyId=9341", reason: null },
    }, ["admin"], true, "America/New_York");
    expect(row.accounting).toMatch(/review/i);
    expect(row.payment).toBe("Unpaid");
    expect(row.localSubtotal?.cents).toBe(98000);
    expect(row.total.cents).toBe(99000);
    expect(row.quickbooksHref).toContain("txnId=7");
  });
});
