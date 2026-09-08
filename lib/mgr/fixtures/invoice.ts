// lib/mgr/fixtures/invoice.ts — get_invoice + list_invoice_questions snapshot
// for INV-1039 (failed QuickBooks push). Mapping rows are inventory-only.
import { ALS, SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { InvoiceSnapshot } from "@/lib/mgr/invoice-view";

const INVOICE_1039 = "00000000-0000-4000-8000-000000001039";

const line = (
  id: string,
  sku: { name: string; unit_price_cents: number },
  qty: number,
  unit_price_cents = sku.unit_price_cents,
) => ({
  id,
  qty,
  unit_price_cents,
  amount_cents: qty * unit_price_cents,
  description: sku.name,
  skus: { name: sku.name },
});

/** Failed push of INV-1039 to Al’s Bar: 3 lines, $540, item unmapped. */
export const invoiceFailedAls: InvoiceSnapshot = {
  invoice: {
    id: INVOICE_1039,
    invoice_no: 1039,
    kind: "invoice",
    issued_on: "2026-09-03",
    due_on: "10/03",
    paid_at: null,
    customers: { name: ALS.name },
  },
  lines: [
    line("il-hazy", SKU_HAZY, 2),
    line("il-pils", SKU_PILS, 5),
    line("il-stout", SKU_STOUT, 1, 5000),
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
  mappings: [
    { key: "customer", title: "Customer mapping", detail: `${ALS.name} · customer 227`, tone: "ok" },
    { key: "pils", title: "Pils · case", detail: "QuickBooks item is missing", tone: "w" },
  ],
};
