// lib/mgr/fixtures/portal-invoices.ts — portal_invoices / portal_invoice
// snapshots for INV-1042 (unpaid $948) and INV-1037 (paid). Views own no
// sample data: screens pass toXViewProps(snapshot).
import { RIDGELINE, SKU_HAZY, SKU_PILS } from "./demo";
import type { PortalInvoiceSnapshot } from "@/lib/mgr/portal-invoice-view";
import type { PortalInvoicesSnapshot } from "@/lib/mgr/portal-invoices-view";

const INV_1042 = "00000000-0000-4000-8000-000000001042";
const INV_1037 = "00000000-0000-4000-8000-000000001037";

const DEMO_BREWERY = { name: "Demo Brewing", customer_phone: "(610) 555-0142" };

const line = (
  id: string,
  item: { name: string; amount_cents: number; qty: number; kind?: string },
) => ({
  id,
  kind: item.kind ?? "sku",
  qty: item.qty,
  amount_cents: item.amount_cents,
  description: item.name,
  skus: item.kind ? null : { name: item.name },
});

/** Unpaid INV-1042: 4 Hazy + 6 Pils + 4 keg deposits = $948.00, due 2026-10-03. */
export const portalInvoiceUnpaid: PortalInvoiceSnapshot = {
  invoice: {
    id: INV_1042,
    invoice_no: 1042,
    kind: "invoice",
    issued_on: "2026-09-03",
    due_on: "2026-10-03",
    paid_at: null,
    qbo_balance_cents: 94800,
    total_cents: 94800,
  },
  lines: [
    line("il-hazy", { name: "Hazy IPA · ½ bbl", qty: 4, amount_cents: 4 * SKU_HAZY.unit_price_cents }),
    line("il-pils", { name: SKU_PILS.name, qty: 6, amount_cents: 6 * SKU_PILS.unit_price_cents }),
    line("il-deposit", { name: "Keg deposit · NON", qty: 4, amount_cents: 12000, kind: "keg_deposit" }),
  ],
  brewery: DEMO_BREWERY,
};

/** Paid INV-1037: paid 2026-08-29, $980.00. */
export const portalInvoicePaid: PortalInvoiceSnapshot = {
  invoice: {
    id: INV_1037,
    invoice_no: 1037,
    kind: "invoice",
    issued_on: "2026-08-27",
    due_on: "2026-09-26",
    paid_at: "2026-08-29",
    total_cents: 98000,
  },
  lines: [
    line("il-hazy-paid", { name: "Hazy IPA · ½ bbl", qty: 2, amount_cents: 2 * SKU_HAZY.unit_price_cents }),
    line("il-pils-paid", { name: SKU_PILS.name, qty: 6, amount_cents: 6 * SKU_PILS.unit_price_cents }),
  ],
  brewery: DEMO_BREWERY,
};

/** Ridgeline's portal_invoices list: unpaid INV-1042, paid INV-1037. */
export const portalInvoicesRidgeline: PortalInvoicesSnapshot = {
  customerName: RIDGELINE.name,
  invoices: [
    {
      id: portalInvoiceUnpaid.invoice.id,
      invoice_no: portalInvoiceUnpaid.invoice.invoice_no,
      kind: portalInvoiceUnpaid.invoice.kind,
      due_on: portalInvoiceUnpaid.invoice.due_on,
      paid_at: portalInvoiceUnpaid.invoice.paid_at,
      invoice_lines: portalInvoiceUnpaid.lines.map((l) => ({ amount_cents: l.amount_cents })),
    },
    {
      id: portalInvoicePaid.invoice.id,
      invoice_no: portalInvoicePaid.invoice.invoice_no,
      kind: portalInvoicePaid.invoice.kind,
      due_on: portalInvoicePaid.invoice.due_on,
      paid_at: portalInvoicePaid.invoice.paid_at,
      invoice_lines: [{ amount_cents: portalInvoicePaid.invoice.total_cents }],
    },
  ],
};
