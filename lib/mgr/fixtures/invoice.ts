// lib/mgr/fixtures/invoice.ts — get_invoice + list_invoice_questions snapshots
// for the Invoice screen. INV-1039 (failed QuickBooks push) is the inventory
// frame; its siblings are the partly paid (in QuickBooks, and in MGR),
// edited-in-QuickBooks and credit memo cases the tests paint. Mapping rows are
// inventory-only.
import { ALS, SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { InvoiceSnapshot } from "@/lib/mgr/invoice-view";
import { orderLineCents } from "@/lib/mgr/order-view";
import { qboInvoicePresentation } from "@/lib/mgr/qbo-ui";
import { DEMO_TIME_ZONE } from "./settings";

const INVOICE_1039 = "00000000-0000-4000-8000-000000001039";

type Line = InvoiceSnapshot["lines"][number];

const line = (id: string, sku: { name: string; unit_price_cents: number }, qty: number, unit_price_cents = sku.unit_price_cents): Line => ({
  id, kind: "sku", qty, unit_price_cents, amount_cents: orderLineCents(qty, unit_price_cents), description: sku.name, skus: { name: sku.name },
});

const charge = (id: string, kind: string, description: string, qty: number, unit_price_cents: number): Line => ({
  id, kind, qty, unit_price_cents, amount_cents: orderLineCents(qty, unit_price_cents), description, skus: null,
});

/** Failed push of INV-1039 to Al’s Bar: $540 of beer, $60 of keg deposits and a $15 one-way fee; the Pils item is unmapped. */
export const invoiceFailedAls: InvoiceSnapshot = {
  timeZone: DEMO_TIME_ZONE,
  invoice: {
    id: INVOICE_1039,
    invoice_no: 1039,
    kind: "invoice",
    issued_on: "2026-09-03",
    due_on: "2026-10-03",
    paid_at: null,
    qbo_invoice_id: null,
    customers: { name: ALS.name },
  },
  lines: [
    line("il-hazy", SKU_HAZY, 2),
    line("il-pils", SKU_PILS, 5),
    line("il-stout", SKU_STOUT, 1, 5000),
    charge("il-deposit", "keg_deposit", "Keg deposit · ½ bbl", 2, 3000),
    charge("il-fee", "one_way_keg_fee", "One-way keg fee · ⅙ bbl", 1, 1500),
  ],
  questions: [
    {
      id: "00000000-0000-4000-8000-000000001139",
      body: "The Pils count looks short.",
      created_at: "2026-09-01T13:02:00.000Z",
      answered_at: null,
      customers: { name: "Dana" },
    },
  ],
  // Only the rows that need action: a mapped customer is not listed.
  mappings: [
    { key: "pils", title: "Pils · case", detail: "QuickBooks item is missing", tone: "w" },
  ],
  // A rejected push created no QuickBooks document, so MGR's ledger owns the balance.
  payments: [],
  hasPendingPush: false,
  wasPushedToQbo: false,
  localPaidCents: 0,
  localCreditCents: 0,
};

/** INV-1039's accounting line, from the same authority the live page uses. */
export const invoiceFailedAlsAccounting = qboInvoicePresentation({
  kind: "invoice", roles: ["sales"], connected: true, syncStatus: "push_failed", localPaidCents: 0, syncError: "QuickBooks item mapping required",
});

/** Pushed and partly paid: $615 total, $300 cash received, $315 outstanding. */
export const invoicePartlyPaid: InvoiceSnapshot = {
  ...invoiceFailedAls,
  invoice: { ...invoiceFailedAls.invoice, qbo_invoice_id: "qbo-1039", qbo_remote_state: "live", qbo_total_cents: 61500, qbo_balance_cents: 31500, qbo_cash_collected_cents: 30000 },
  mappings: undefined,
  wasPushedToQbo: true,
};

/** Never in QuickBooks, partly paid in MGR: a $300 check against $615, and a voided $100 cash entry. */
export const invoiceLocalPartlyPaid: InvoiceSnapshot = {
  ...invoiceFailedAls,
  payments: [
    { id: "pay-check", amount_cents: 30000, received_on: "2026-09-20", method: "check", reference: "1182", void: null },
    { id: "pay-cash", amount_cents: 10000, received_on: "2026-09-12", method: "cash", reference: null, void: { reason: "Counted twice" } },
  ],
  localPaidCents: 30000,
};

/** A return after full payment: $76 is owed back to the buyer, not due. */
export const invoiceLocalCreditBalance: InvoiceSnapshot = {
  ...invoiceLocalPartlyPaid,
  invoice: { ...invoiceLocalPartlyPaid.invoice, paid_at: "2026-09-20T04:00:00Z" },
  localPaidCents: 61500,
  localCreditCents: 7600,
  payments: [{ id: "pay-full", amount_cents: 61500, received_on: "2026-09-20", method: "check", reference: "1182", void: null }],
};

/** Accounting raised the QuickBooks total to $640 over $615 of frozen MGR lines. */
export const invoiceEditedInQbo: InvoiceSnapshot = {
  ...invoiceFailedAls,
  invoice: { ...invoiceFailedAls.invoice, qbo_invoice_id: "qbo-1039", qbo_remote_state: "live", qbo_total_cents: 64000, qbo_balance_cents: 64000, qbo_accountant_drift: true },
  mappings: undefined,
  wasPushedToQbo: true,
};

/** CM-1040: two Pils cases returned against INV-1039. */
export const creditMemoAls: InvoiceSnapshot = {
  timeZone: DEMO_TIME_ZONE,
  invoice: { ...invoiceFailedAls.invoice, id: "00000000-0000-4000-8000-000000001040", invoice_no: 1040, kind: "credit_memo", issued_on: "2026-09-10", due_on: null, qbo_balance_cents: 7600 },
  lines: [line("cl-pils", SKU_PILS, -2)],
  questions: [],
  payments: [],
  hasPendingPush: false,
  wasPushedToQbo: false,
  localPaidCents: 0,
  localCreditCents: 0,
};
