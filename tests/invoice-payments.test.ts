// Invoice payments recorded in MGR (#1045, docs/plans/invoice-local-payments.md):
// the append-only payment and void ledgers and the invoice_totals sum they feed.
import { describe, expect, it } from "vitest";
import { ins, makeBrewery, makeStaff, seedCatalog, seedCustomer, sql } from "./helpers";

async function localInvoice() {
  const breweryId = (await makeBrewery()).id;
  const staff = await makeStaff(breweryId, "sales");
  const { skuId } = await seedCatalog(breweryId);
  const { customerId } = await seedCustomer(breweryId);
  const invoice = await ins("invoices", { brewery_id: breweryId, customer_id: customerId, kind: "invoice" });
  await ins("invoice_lines", { brewery_id: breweryId, invoice_id: invoice.id, sku_id: skuId, description: "IPA", qty: 2, unit_price_cents: 5000 });
  return { breweryId, staffId: staff.id, invoiceId: invoice.id };
}

/** Inserts one payment with privileged SQL (authenticated has no insert grant) and returns its id. */
function pay(f: { breweryId: string; staffId: string; invoiceId: string }, amountCents: number, method = "check") {
  return sql(`insert into public.invoice_payments(brewery_id,invoice_id,amount_cents,received_on,method,recorded_by)
    values ('${f.breweryId}','${f.invoiceId}',${amountCents},'2026-10-20','${method}','${f.staffId}') returning id`, true)[0];
}

function voidPayment(f: { breweryId: string; staffId: string }, paymentId: string) {
  return sql(`insert into public.invoice_payment_voids(brewery_id,payment_id,reason,voided_by)
    values ('${f.breweryId}','${paymentId}','Entered twice','${f.staffId}') returning id`, true)[0];
}

describe("invoice payment ledger", () => {
  it("refuses update and delete of payment and void rows", async () => {
    const f = await localInvoice();
    const payment = pay(f, 4000);
    voidPayment(f, payment);
    for (const table of ["invoice_payments", "invoice_payment_voids"]) {
      expect(() => sql(`update public.${table} set brewery_id=brewery_id where brewery_id='${f.breweryId}'`, true))
        .toThrow(/invoice payment history is immutable/);
      expect(() => sql(`delete from public.${table} where brewery_id='${f.breweryId}'`, true))
        .toThrow(/invoice payment history is immutable/);
    }
  });

  it("allows one void per payment", async () => {
    const f = await localInvoice();
    const payment = pay(f, 4000);
    voidPayment(f, payment);
    expect(() => voidPayment(f, payment)).toThrow(/invoice_payment_voids_brewery_id_payment_id_key/);
  });

  it("refuses an unknown method", async () => {
    const f = await localInvoice();
    expect(() => pay(f, 4000, "bitcoin")).toThrow(/invoice_payments_method_check/);
  });

  it("grants authenticated select only and service_role nothing", () => {
    const privileges = (role: string, table: string) =>
      ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"].map(p => sql(`select has_table_privilege('${role}','public.${table}','${p}')::text`, true)[0]);
    for (const table of ["invoice_payments", "invoice_payment_voids"]) {
      expect(privileges("authenticated", table), table).toEqual(["true", "false", "false", "false", "false"]);
      expect(privileges("service_role", table), table).toEqual(["false", "false", "false", "false", "false"]);
      expect(privileges("anon", table), table).toEqual(["false", "false", "false", "false", "false"]);
    }
  });

  it("sums unvoided payments only in invoice_totals.local_paid_cents", async () => {
    const f = await localInvoice();
    const localPaid = () => sql(`select local_paid_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true);
    expect(localPaid()).toEqual(["0"]);
    pay(f, 2500);
    const mistaken = pay(f, 4000);
    expect(localPaid()).toEqual(["6500"]);
    voidPayment(f, mistaken);
    expect(localPaid()).toEqual(["2500"]);
    expect(sql(`select subtotal_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual(["10000"]);
  });
});
