// Invoice payments recorded in MGR (#1045, docs/plans/invoice-local-payments.md):
// the append-only payment and void ledgers and the invoice_totals sum they feed.
import { describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, sql } from "./helpers";

/** A $100.00 invoice QuickBooks never received, with a Sales member to act on it. */
async function localInvoice(invoice: Record<string, unknown> = {}, unitPriceCents = 5000) {
  const breweryId = (await makeBrewery()).id;
  const sales = await makeStaffCtx(breweryId, "sales");
  const { skuId } = await seedCatalog(breweryId);
  const { customerId } = await seedCustomer(breweryId);
  const row = await ins("invoices", { brewery_id: breweryId, customer_id: customerId, kind: "invoice", ...invoice });
  await ins("invoice_lines", { brewery_id: breweryId, invoice_id: row.id, sku_id: skuId, description: "IPA", qty: 2, unit_price_cents: unitPriceCents });
  return { breweryId, staffId: sales.userId, invoiceId: row.id, sales };
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

type Fixture = Awaited<ReturnType<typeof localInvoice>>;
type Ctx = Fixture["sales"];

/** Calls record_invoice_payment as `ctx` (Sales by default); the input overrides a $40.00 check received 2026-10-20. */
function record(f: Fixture, input: Record<string, unknown> = {}, ctx: Ctx = f.sales) {
  return ctx.db.rpc("record_invoice_payment", {
    p_brewery: f.breweryId, p_invoice: f.invoiceId, p_amount_cents: 4000, p_received_on: "2026-10-20",
    p_method: "check", p_reference: null as never, p_request_id: crypto.randomUUID(), ...input,
  });
}

function voidRpc(f: Fixture, paymentId: string, input: Record<string, unknown> = {}, ctx: Ctx = f.sales) {
  return ctx.db.rpc("void_invoice_payment", {
    p_brewery: f.breweryId, p_payment: paymentId, p_reason: "Entered twice", p_request_id: crypto.randomUUID(), ...input,
  });
}

/** The invoice's paid_at as the brewery-local (America/New_York) wall time, or "" when unpaid. */
const paidAtLocal = (f: Fixture) =>
  sql(`select coalesce((paid_at at time zone 'America/New_York')::text,'') from public.invoices where id='${f.invoiceId}'`, true)[0] ?? "";

/** Adds a QuickBooks connection and one push of the invoice with `status`, as the database owner. */
async function pushOf(f: Fixture, status: "pending" | "pushed") {
  const realm = `realm-${crypto.randomUUID()}`;
  const connection = (await admin.from("qbo_connections").insert({ brewery_id: f.breweryId, realm_id: realm, state: "connected" })
    .select("id").single().throwOnError()).data!;
  const pushed = status === "pushed";
  sql(`insert into public.qbo_pushes(brewery_id,invoice_id,connection_id,realm_id,entity_type,provider_request_id,
      request_body,local_snapshot,attempt_reason,status,qbo_entity_id,response,finished_at)
    values('${f.breweryId}','${f.invoiceId}','${connection.id}','${realm}','Invoice',gen_random_uuid(),'{}','{}','initial',
      '${status}',${pushed ? "'remote-1'" : "null"},${pushed ? "'{}'" : "null"},${pushed ? "now()" : "null"})`, true);
  if (pushed) await admin.from("invoices").update({ qbo_invoice_id: "remote-1", qbo_sync_status: "pushed" }).eq("id", f.invoiceId).throwOnError();
}

/** A new QuickBooks company: purge_qbo_identity clears every invoice's QuickBooks identity. */
const changeRealm = (f: Fixture) =>
  admin.from("qbo_connections").update({ realm_id: `realm-${crypto.randomUUID()}` }).eq("brewery_id", f.breweryId).throwOnError();

describe("record_invoice_payment and void_invoice_payment", () => {
  it("takes a partial then a full payment, dates paid_at, and a void below the total clears it", async () => {
    const f = await localInvoice();
    const first = await record(f, { p_amount_cents: 4000, p_reference: "  Check 1001  " });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ invoiceId: f.invoiceId, balanceCents: 6000 });
    expect(sql(`select coalesce(reference,'') from public.invoice_payments where invoice_id='${f.invoiceId}'`, true)).toEqual(["Check 1001"]);
    expect(paidAtLocal(f)).toBe("");

    const rest = await record(f, { p_amount_cents: 6000, p_received_on: "2026-10-21", p_method: "ach" });
    expect(rest.error).toBeNull();
    expect(rest.data).toMatchObject({ balanceCents: 0 });
    // The brewery-local start of the day the last payment was received.
    expect(paidAtLocal(f)).toBe("2026-10-21 00:00:00");

    const voided = await voidRpc(f, (first.data as { paymentId: string }).paymentId);
    expect(voided.error).toBeNull();
    expect(voided.data).toMatchObject({ invoiceId: f.invoiceId, balanceCents: 4000 });
    expect(paidAtLocal(f)).toBe("");
    expect(sql(`select local_paid_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual(["6000"]);
  });

  it("replays the first result for one request id and refuses a changed payload", async () => {
    const f = await localInvoice();
    const requestId = crypto.randomUUID();
    const first = await record(f, { p_request_id: requestId });
    const replay = await record(f, { p_request_id: requestId });
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);
    expect(sql(`select count(*) from public.invoice_payments where invoice_id='${f.invoiceId}'`, true)).toEqual(["1"]);
    expect((await record(f, { p_request_id: requestId, p_amount_cents: 100 })).error?.message).toMatch(/request id was already used with a different payload/);

    const paymentId = (first.data as { paymentId: string }).paymentId;
    const voidRequest = crypto.randomUUID();
    const voided = await voidRpc(f, paymentId, { p_request_id: voidRequest });
    expect((await voidRpc(f, paymentId, { p_request_id: voidRequest })).data).toEqual(voided.data);
    expect((await voidRpc(f, paymentId, { p_request_id: voidRequest, p_reason: "Other" })).error?.message).toMatch(/different payload/);
  });

  it("refuses a QuickBooks invoice, a credit memo and a written-off invoice (Q6)", async () => {
    expect((await record(await localInvoice({ qbo_invoice_id: "remote-9", qbo_sync_status: "pushed" }))).error?.message)
      .toMatch(/this invoice is in QuickBooks; record its payment there/);
    expect((await record(await localInvoice({ kind: "credit_memo" }))).error?.message).toMatch(/only an invoice takes a payment/);
    const writtenOff = await localInvoice();
    await admin.from("invoices").update({ written_off_at: new Date().toISOString(), written_off_by: writtenOff.staffId, written_off_reason: "Fixture" })
      .eq("id", writtenOff.invoiceId).throwOnError();
    expect((await record(writtenOff)).error?.message).toMatch(/a written-off invoice takes no payment/);
  });

  it("refuses an invoice already paid, including a historical one (Q7)", async () => {
    const paid = await localInvoice({ paid_at: new Date().toISOString() });
    expect((await record(paid)).error?.message).toMatch(/this invoice is already paid/);
    const historical = await localInvoice({ paid_at: new Date().toISOString(), qbo_sync_status: "not_synced" });
    expect((await record(historical)).error?.message).toMatch(/this invoice is already paid/);
  });

  it("refuses a pending push, before and after a company change (Q3)", async () => {
    const f = await localInvoice();
    await pushOf(f, "pending");
    expect((await record(f)).error?.message).toMatch(/a QuickBooks push of this invoice is unresolved; retry it first/);
    await changeRealm(f);
    expect((await record(f)).error?.message).toMatch(/a QuickBooks push of this invoice is unresolved; retry it first/);
  });

  it("refuses an unpaid invoice pushed to a previous QuickBooks company (Q4)", async () => {
    const f = await localInvoice();
    await pushOf(f, "pushed");
    await changeRealm(f);
    expect(sql(`select (qbo_invoice_id is null)::text from public.invoices where id='${f.invoiceId}'`, true)).toEqual(["true"]);
    expect((await record(f)).error?.message).toMatch(/this invoice was in a previous QuickBooks company; push it to the current one/);
  });

  it("refuses more than the balance (Q1) and any payment on a $0.00 invoice (Design 4)", async () => {
    const f = await localInvoice();
    expect((await record(f, { p_amount_cents: 10001 })).error?.message).toMatch(/a payment cannot be more than the balance due/);
    expect((await record(f, { p_amount_cents: 6000 })).error).toBeNull();
    expect((await record(f, { p_amount_cents: 4001 })).error?.message).toMatch(/a payment cannot be more than the balance due/);
    expect((await record(f, { p_amount_cents: 0 })).error?.message).toMatch(/a payment must be more than \$0.00/);
    const free = await localInvoice({}, 0);
    expect((await record(free, { p_amount_cents: 1 })).error?.message).toMatch(/a payment cannot be more than the balance due/);
  });

  it("refuses a received date after today in the brewery's zone, and accepts one before issue (Q10)", async () => {
    const f = await localInvoice();
    const tomorrow = sql(`select ((now() at time zone 'America/New_York')::date + 1)::text`, true)[0];
    expect((await record(f, { p_received_on: tomorrow })).error?.message).toMatch(/a payment cannot be received in the future/);
    const issued = sql(`select issued_on::text from public.invoices where id='${f.invoiceId}'`, true)[0];
    const beforeIssue = sql(`select ('${issued}'::date - 30)::text`, true)[0];
    expect((await record(f, { p_received_on: beforeIssue })).error).toBeNull();
  });

  it("refuses a second void of one payment and an empty reason", async () => {
    const f = await localInvoice();
    const paymentId = ((await record(f)).data as { paymentId: string }).paymentId;
    expect((await voidRpc(f, paymentId, { p_reason: "  " })).error?.message).toMatch(/void reason must be 1 to 500 characters/);
    expect((await voidRpc(f, paymentId)).error).toBeNull();
    expect((await voidRpc(f, paymentId)).error?.message).toMatch(/this payment is already voided/);
  });

  it("lets only Admin and Sales of the invoice's brewery write", async () => {
    const f = await localInvoice();
    const paymentId = ((await record(f)).data as { paymentId: string }).paymentId;
    expect((await record(f, { p_amount_cents: 100 }, await makeStaffCtx(f.breweryId, "admin"))).error).toBeNull();
    for (const role of ["warehouse", "brewer"] as const) {
      const ctx = await makeStaffCtx(f.breweryId, role);
      expect((await record(f, {}, ctx)).error?.code, role).toBe("42501");
      expect((await voidRpc(f, paymentId, {}, ctx)).error?.code, role).toBe("42501");
    }
    const other = await localInvoice();
    expect((await record(f, {}, other.sales)).error?.code).toBe("42501");
    expect((await voidRpc(f, paymentId, {}, other.sales)).error?.code).toBe("42501");
    // Their own brewery id does not reach this brewery's invoice or payment.
    expect((await record(f, { p_brewery: other.breweryId }, other.sales)).error?.message).toMatch(/invoice not found/);
    expect((await voidRpc(f, paymentId, { p_brewery: other.breweryId }, other.sales)).error?.message).toMatch(/payment not found/);
    expect(sql(`select count(*) from public.invoice_payment_voids where payment_id='${paymentId}'`, true)).toEqual(["0"]);
  });
});
