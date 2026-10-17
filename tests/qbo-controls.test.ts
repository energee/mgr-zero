import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toInvoiceListRow } from "@/lib/mgr/invoices-view";

const source = readFileSync("app/(app)/settings/accounting/qbo-controls.tsx", "utf8");
const invoiceList = readFileSync("app/(app)/invoices/page.tsx", "utf8");
const listRow = readFileSync("lib/mgr/invoices-view.ts", "utf8");

describe("QuickBooks control boundaries", () => {
  it("opens one confirmation surface before every remote-create action", () => {
    expect(source).toMatch(/qboPushConfirmation/);
    expect(source).toMatch(/setPendingPush\("push"\)/);
    expect(source).toMatch(/setPendingPush\("retry"\)/);
    expect(source).toMatch(/setPendingPush\("corrected_push"\)/);
    expect(source).toMatch(/setPendingPush\("repush"\)/);
    expect(source).toMatch(/title=\{confirmation\.title\}/);
    expect(source).toMatch(/Sending….*confirmation\.confirmLabel/);
    expect(source).not.toMatch(/onClick=\{\(\) => push\(/);
    expect(source).toMatch(/onClick=\{\(\) => void push\(pendingPush!\)\}/);
  });

  it("remounts mapping field state from the current saved server value", () => {
    expect(source).toMatch(/key=\{qboMappingVersion\([\w.]*currentId\)\}/);
  });

  it("keeps accounting review separate from payment and current totals", () => {
    expect(invoiceList).toMatch(/toInvoiceListRow\(invoice, brewery\.role/);
    expect(listRow).not.toMatch(/&& !inv\.qbo_accountant_drift/);
    const row = toInvoiceListRow({
      id: "inv", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null,
      qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live",
      qbo_balance_cents: 98000, qbo_cash_collected_cents: 0, qbo_accountant_drift: true,
      written_off_at: null, subtotal_cents: 98000, total_cents: 99000, has_pending_qbo_push: false,
      customers: { name: "Ridgeline" }, quickbooks_link: { href: "https://app.qbo.intuit.com/app/invoice?txnId=7&companyId=9341", reason: null },
    }, "admin", true, "America/New_York");
    expect(row.accounting).toBe("Review accounting in QuickBooks");
    expect(row.payment).toBe("Balance due");
    expect(row.localSubtotal?.value).toBe("$980.00");
    expect(row.quickbooksHref).toContain("txnId=7");
  });
});
