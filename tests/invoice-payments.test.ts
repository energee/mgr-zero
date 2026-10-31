// Invoice payments recorded in MGR (#1045, docs/plans/invoice-local-payments.md):
// the append-only payment and void ledgers and the invoice_totals sum they feed,
// the record and void RPCs, and start_qbo_push's refusal of an invoice with payments.
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { PAYMENT_METHODS } from "@/lib/mgr/enums";
import { admin, DB, ins, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";

/** A $100.00 invoice QuickBooks never received, with a Sales member to act on it. */
async function localInvoice(invoice: Record<string, unknown> = {}, unitPriceCents = 5000) {
  const breweryId = (await makeBrewery()).id;
  const sales = await makeStaffCtx(breweryId, "sales");
  const { skuId } = await seedCatalog(breweryId);
  const { customerId } = await seedCustomer(breweryId);
  const row = await ins("invoices", { brewery_id: breweryId, customer_id: customerId, kind: "invoice", ...invoice });
  const line = await ins("invoice_lines", { brewery_id: breweryId, invoice_id: row.id, sku_id: skuId, description: "IPA", qty: 2, unit_price_cents: unitPriceCents });
  return { breweryId, staffId: sales.userId, invoiceId: row.id, invoiceLineId: line.id, sales };
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

/** Credits the original frozen line through the real Sales command. */
async function credit(f: Fixture, qty: number) {
  const location = await seedLocation(f.breweryId, { name: `Returns ${crypto.randomUUID()}` });
  const result = await runCommand("create_credit_memo", {
    invoiceId: f.invoiceId, locationId: location.id, reason: "Beer returned",
    lines: [{ invoiceLineId: f.invoiceLineId, qty }],
  }, f.sales);
  return z.object({ invoice_id: z.string().uuid() }).parse(result);
}

describe("credit memos reduce an MGR invoice balance (#1627)", () => {
  it("nets a linked keg-deposit refund without treating it as cash", async () => {
    const f = await localInvoice();
    const pool = await ins("keg_pools", { brewery_id: f.breweryId, name: "Deposit pool", kind: "owned" });
    const deposit = await ins("invoice_lines", {
      brewery_id: f.breweryId, invoice_id: f.invoiceId, kind: "keg_deposit", keg_pool_id: pool.id,
      keg_size: "half_bbl", qty: 1, unit_price_cents: 3000, description: "Keg deposit",
    });
    await credit({ ...f, invoiceLineId: deposit.id }, 1);
    const payment = await record(f, { p_amount_cents: 10000 });
    expect(payment.error).toBeNull();
    expect(payment.data).toMatchObject({ balanceCents: 0 });
    expect(await runCommand("get_invoice", { invoiceId: f.invoiceId }, f.sales)).toMatchObject({ localCreditCents: 3000, localPaidCents: 10000 });
  });

  it("keeps the credit visible to Warehouse but not another brewery", async () => {
    const f = await localInvoice();
    await credit(f, 1);
    const warehouse = await makeStaffCtx(f.breweryId, "warehouse");
    expect(await runCommand("get_invoice", { invoiceId: f.invoiceId }, warehouse)).toMatchObject({ localCreditCents: 5000 });
    const other = await localInvoice();
    const read = await other.sales.db.from("invoice_totals").select("local_credit_cents").eq("invoice_id", f.invoiceId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
  });

  it("serializes a payment against a credit and caps it at the newly reduced balance", async () => {
    const f = await localInvoice({}, 50000);
    const location = await seedLocation(f.breweryId);
    const returner = await sessionAs(f.staffId);
    const payer = await sessionAs(f.staffId);
    let paying: Promise<unknown> | undefined;
    try {
      await returner.client.query("begin");
      await returner.client.query("select public.create_credit_memo($1,$2::jsonb,$3,'Returned',$4)", [
        f.invoiceId, JSON.stringify([{ invoice_line_id: f.invoiceLineId, qty: 0.4 }]), location.id, crypto.randomUUID(),
      ]);
      paying = payer.client.query("select public.record_invoice_payment($1,$2,100000,'2026-10-20','check',null,$3)",
        [f.breweryId, f.invoiceId, crypto.randomUUID()]);
      const rejected = paying.then(() => false, () => true);
      await expect.poll(() => sql(`select wait_event_type from pg_stat_activity where pid=${payer.pid}`, true)[0], { timeout: 3000 }).toBe("Lock");
      await returner.client.query("commit");
      expect(await rejected).toBe(true);
      expect(sql(`select local_paid_cents, local_credit_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual(["0|20000"]);
      expect(sql(`select count(*) from public.invoice_payments where invoice_id='${f.invoiceId}'`, true)).toEqual(["0"]);
    } finally {
      await returner.client.query("rollback").catch(() => undefined);
      if (paying) await Promise.allSettled([paying]);
      await Promise.all([returner.client.end(), payer.client.end()]);
    }
  });

  it("accepts $800 after a $200 credit on $1,000 and removes the settled invoice from unpaid AR", async () => {
    const f = await localInvoice({}, 50000);
    await credit(f, 0.4);
    expect(sql(`select local_credit_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual(["20000"]);
    expect((await record(f, { p_amount_cents: 80001 })).error).not.toBeNull();
    expect(sql(`select count(*) from public.invoice_payments where invoice_id='${f.invoiceId}'`, true)).toEqual(["0"]);
    const result = await record(f, { p_amount_cents: 80000 });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ balanceCents: 0 });
    expect(paidAtLocal(f)).not.toBe("");
    expect(await runCommand("list_invoices", { status: "unpaid" }, f.sales)).toMatchObject({ rows: [] });
    expect(await runCommand("get_invoice", { invoiceId: f.invoiceId }, f.sales)).toMatchObject({ localCreditCents: 20000, localPaidCents: 80000 });
    expect((await runCommand("list_invoices", {}, f.sales)) as { rows: unknown[] }).toMatchObject({
      rows: expect.arrayContaining([expect.objectContaining({ id: f.invoiceId, local_credit_cents: 20000, subtotal_cents: 100000 })]),
    });
  });

  it("settles when the credit follows the partial payment, and reopens when that payment is voided", async () => {
    const f = await localInvoice({}, 50000);
    const payment = await record(f, { p_amount_cents: 80000 });
    await credit(f, 0.2);
    expect(paidAtLocal(f)).toBe("");
    await credit(f, 0.2);
    expect(paidAtLocal(f)).not.toBe("");
    const voided = await voidRpc(f, payment.data!.paymentId);
    expect(voided.error).toBeNull();
    expect(voided.data).toMatchObject({ balanceCents: 80000 });
    expect(paidAtLocal(f)).toBe("");
  });

  it("closes a full credit without cash and refuses another payment", async () => {
    const f = await localInvoice();
    await credit(f, 2);
    expect(paidAtLocal(f)).not.toBe("");
    expect((await record(f, { p_amount_cents: 1 })).error).not.toBeNull();
    expect(await runCommand("list_invoices", { status: "unpaid" }, f.sales)).toMatchObject({ rows: [] });
    expect(sql(`select local_paid_cents, local_credit_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual(["0|10000"]);
  });

  it("retains the excess after a paid invoice is credited, and void math uses the credited total", async () => {
    const f = await localInvoice({}, 50000);
    const payment = await record(f, { p_amount_cents: 100000 });
    await credit(f, 0.4);
    expect(await runCommand("get_invoice", { invoiceId: f.invoiceId }, f.sales)).toMatchObject({ localPaidCents: 100000, localCreditCents: 20000 });
    const voided = await voidRpc(f, payment.data!.paymentId);
    expect(voided.error).toBeNull();
    expect(voided.data).toMatchObject({ balanceCents: 80000 });
    expect(paidAtLocal(f)).toBe("");
  });

  it("ignores a voided or deleted memo and restores its credit when live again", async () => {
    const f = await localInvoice();
    const memo = await credit(f, 2);
    for (const state of ["voided", "deleted", "live"] as const) {
      await admin.from("invoices").update({ qbo_remote_state: state }).eq("id", memo.invoice_id).throwOnError();
      expect(sql(`select local_credit_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual([state === "live" ? "10000" : "0"]);
      expect(Boolean(paidAtLocal(f))).toBe(state === "live");
    }
  });
});

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

  it("dates paid_at by the latest received day, even when a backdated payment completes the total", async () => {
    const f = await localInvoice();
    expect((await record(f, { p_amount_cents: 6000, p_received_on: "2026-10-20" })).error).toBeNull();
    expect((await record(f, { p_amount_cents: 4000, p_received_on: "2026-10-05", p_method: "cash" })).error).toBeNull();
    expect(paidAtLocal(f)).toBe("2026-10-20 00:00:00");
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

/** Connects a QuickBooks company and maps the invoice's customer and SKU, so start_qbo_push passes every other check. */
async function connectBooks(f: Fixture) {
  await admin.from("qbo_connections").insert({ brewery_id: f.breweryId, realm_id: `realm-${crypto.randomUUID()}`, realm_label: "Fixture books", state: "connected" })
    .throwOnError();
  const { customer_id } = (await admin.from("invoices").select("customer_id").eq("id", f.invoiceId).single().throwOnError()).data!;
  const { sku_id } = (await admin.from("invoice_lines").select("sku_id").eq("invoice_id", f.invoiceId).single().throwOnError()).data!;
  expect((await f.sales.db.rpc("set_qbo_customer_mapping", {
    p_brewery: f.breweryId, p_customer: customer_id, p_qbo_customer_id: "customer-42", p_request_id: crypto.randomUUID(),
  })).error).toBeNull();
  expect((await f.sales.db.rpc("set_qbo_item_mapping", {
    p_brewery: f.breweryId, p_sku: sku_id!, p_qbo_item_id: "item-24", p_request_id: crypto.randomUUID(),
  })).error).toBeNull();
}

const startPush = (f: Fixture) => f.sales.db.rpc("start_qbo_push", {
  p_brewery: f.breweryId, p_invoice: f.invoiceId, p_new_attempt_reason: null as never, p_request_id: crypto.randomUUID(),
});

/** A pg session acting as `userId` through RLS, as PostgREST would; it can hold a transaction open. */
async function sessionAs(userId: string) {
  const client = new Client({ connectionString: DB });
  await client.connect();
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  const pid = (await client.query<{ pid: number }>("select pg_backend_pid() pid")).rows[0].pid;
  return { client, pid };
}

const refused = /payments for this invoice are recorded in MGR, so it is not sent to QuickBooks/;

describe("start_qbo_push and local payments", () => {
  it("refuses an invoice with an unvoided payment, through the RPC and the push_invoice_to_qbo command", async () => {
    const f = await localInvoice();
    await connectBooks(f);
    expect((await record(f)).error).toBeNull();
    expect((await startPush(f)).error?.message).toMatch(refused);
    vi.stubEnv("QBO_CLIENT_ID", "client-id");
    vi.stubEnv("QBO_CLIENT_SECRET", "client-secret");
    vi.stubEnv("QBO_REDIRECT_URI", "https://mgr.test/api/integrations/qbo/oauth");
    vi.stubEnv("QBO_API_BASE", "https://sandbox-quickbooks.api.intuit.com");
    try {
      await expect(runCommand("push_invoice_to_qbo", { invoiceId: f.invoiceId }, f.sales)).rejects.toThrow(refused);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(sql(`select count(*) from public.qbo_pushes where invoice_id='${f.invoiceId}'`, true)).toEqual(["0"]);
  });

  it("starts the push once every payment is voided (Q8)", async () => {
    const f = await localInvoice();
    await connectBooks(f);
    const ids = [];
    for (const amount of [2500, 4000]) ids.push(((await record(f, { p_amount_cents: amount })).data as { paymentId: string }).paymentId);
    expect((await voidRpc(f, ids[0])).error).toBeNull();
    expect((await startPush(f)).error?.message).toMatch(refused);
    expect((await voidRpc(f, ids[1])).error).toBeNull();
    const push = await startPush(f);
    expect(push.error).toBeNull();
    expect(push.data).toMatchObject({ status: "pending" });
  });

  it("makes a push wait on a payment's row lock, then refuses it", async () => {
    const f = await localInvoice();
    await connectBooks(f);
    const payer = await sessionAs(f.staffId);
    const pusher = await sessionAs(f.staffId);
    let pushing: Promise<unknown> | undefined;
    try {
      await payer.client.query("begin");
      await payer.client.query("select public.record_invoice_payment($1,$2,4000,'2026-10-20','check',null,$3)",
        [f.breweryId, f.invoiceId, crypto.randomUUID()]);
      pushing = pusher.client.query("select public.start_qbo_push($1,$2,null,$3)", [f.breweryId, f.invoiceId, crypto.randomUUID()]);
      const settled = pushing.then(() => "started", (e: Error) => e.message);
      // As the owner: the authenticated role cannot see another backend's wait state.
      await expect.poll(() => sql(`select wait_event_type from pg_stat_activity where pid=${pusher.pid}`, true)[0], { timeout: 3000 })
        .toBe("Lock");
      await payer.client.query("commit");
      expect(await settled).toMatch(refused);
    } finally {
      await payer.client.query("rollback").catch(() => undefined);
      if (pushing) await Promise.allSettled([pushing]);
      await Promise.all([payer.client.end(), pusher.client.end()]);
    }
  });
});

describe("record_invoice_payment and void_invoice_payment commands", () => {
  const payment = { amountCents: 2500, receivedOn: "2026-10-20", method: "check" };

  it("refuses a warehouse member in the registry, before the RPC", async () => {
    const f = await localInvoice();
    const warehouse = await makeStaffCtx(f.breweryId, "warehouse");
    // Only the registry's gate says "requires [roles]"; the RPC's assert_staff gives a bare "permission denied".
    const refusedByRegistry = (name: string) =>
      ({ status: 403, code: "permission_denied", message: expect.stringContaining(`${name} requires [`) });
    await expect(runCommand("record_invoice_payment", { invoiceId: f.invoiceId, ...payment }, warehouse))
      .rejects.toMatchObject(refusedByRegistry("record_invoice_payment"));
    await expect(runCommand("void_invoice_payment", { paymentId: crypto.randomUUID(), reason: "Entered twice" }, warehouse))
      .rejects.toMatchObject(refusedByRegistry("void_invoice_payment"));
  });

  it("trims the reference, refuses a received date that is not a date, and voids with a reason", async () => {
    const f = await localInvoice();
    const recorded = await runCommand("record_invoice_payment", { invoiceId: f.invoiceId, ...payment, reference: "  Check 1001  " }, f.sales);
    expect(recorded).toMatchObject({ invoiceId: f.invoiceId, balanceCents: 7500 });
    expect(sql(`select reference from public.invoice_payments where invoice_id='${f.invoiceId}'`, true)).toEqual(["Check 1001"]);
    await expect(runCommand("record_invoice_payment", { invoiceId: f.invoiceId, ...payment, receivedOn: "Oct 20" }, f.sales))
      .rejects.toMatchObject({ code: "invalid_input" });
    const { paymentId } = recorded as { paymentId: string };
    await expect(runCommand("void_invoice_payment", { paymentId, reason: "  " }, f.sales)).rejects.toMatchObject({ code: "invalid_input" });
    expect(await runCommand("void_invoice_payment", { paymentId, reason: "Entered twice" }, f.sales))
      .toEqual({ paymentId, invoiceId: f.invoiceId, balanceCents: 10000 });
  });

  it("stores every PAYMENT_METHODS value, so the list and the database check agree", async () => {
    const f = await localInvoice();
    for (const method of PAYMENT_METHODS) {
      await runCommand("record_invoice_payment", { invoiceId: f.invoiceId, ...payment, method }, f.sales);
    }
    expect(sql(`select method from public.invoice_payments where invoice_id='${f.invoiceId}' order by recorded_at, method`, true).sort())
      .toEqual([...PAYMENT_METHODS].sort());
  });
});

describe("list_invoices and get_invoice carry the ledger", () => {
  type ListRow = { id: string; local_paid_cents: number; has_pending_qbo_push: boolean; was_pushed_to_qbo: boolean };
  const listRow = async (f: Fixture, ctx: Ctx = f.sales) =>
    ((await runCommand("list_invoices", {}, ctx)) as { rows: ListRow[] }).rows.find(row => row.id === f.invoiceId)!;
  const detail = async (f: Fixture, ctx: Ctx = f.sales) => (await runCommand("get_invoice", { invoiceId: f.invoiceId }, ctx)) as
    { payments: unknown[]; localPaidCents: number; hasPendingPush: boolean; wasPushedToQbo: boolean };

  it("returns the unvoided sum and every payment, a voided one with its reason, newest received first", async () => {
    const f = await localInvoice();
    const kept = await runCommand("record_invoice_payment",
      { invoiceId: f.invoiceId, amountCents: 2500, receivedOn: "2026-10-19", method: "cash" }, f.sales) as { paymentId: string };
    const mistaken = await runCommand("record_invoice_payment",
      { invoiceId: f.invoiceId, amountCents: 4000, receivedOn: "2026-10-20", method: "check", reference: "Check 1001" }, f.sales) as { paymentId: string };
    await runCommand("void_invoice_payment", { paymentId: mistaken.paymentId, reason: "Entered twice" }, f.sales);

    expect(await listRow(f)).toMatchObject({ local_paid_cents: 2500, has_pending_qbo_push: false, was_pushed_to_qbo: false });
    const read = await detail(f);
    expect(read.localPaidCents).toBe(2500);
    expect(read.payments).toEqual([
      { id: mistaken.paymentId, amount_cents: 4000, received_on: "2026-10-20", method: "check", reference: "Check 1001", void: { reason: "Entered twice" } },
      { id: kept.paymentId, amount_cents: 2500, received_on: "2026-10-19", method: "cash", reference: null, void: null },
    ]);
  });

  it("names the customer's last unvoided payment method, from any of its invoices (#1506)", async () => {
    const f = await localInvoice();
    const method = async () => ((await runCommand("get_invoice", { invoiceId: f.invoiceId }, f.sales)) as { lastPaymentMethod: string | null }).lastPaymentMethod;
    expect(await method()).toBeNull();
    const customerId = sql(`select customer_id from public.invoices where id='${f.invoiceId}'`, true)[0];
    const earlier = await ins("invoices", { brewery_id: f.breweryId, customer_id: customerId, kind: "invoice" });
    pay({ ...f, invoiceId: earlier.id }, 1000, "ach");
    expect(await method()).toBe("ach");
    // A voided payment was a mistake, so it never sets the method.
    voidPayment(f, pay(f, 1000, "cash"));
    expect(await method()).toBe("ach");
    // Another customer's payment is never this customer's habit.
    const { customerId: otherCustomer } = await seedCustomer(f.breweryId, { name: "Other bar" });
    const others = await ins("invoices", { brewery_id: f.breweryId, customer_id: otherCustomer, kind: "invoice" });
    pay({ ...f, invoiceId: others.id }, 1000, "other");
    expect(await method()).toBe("ach");
  });

  it("reports a pending push, and a push to a previous QuickBooks company", async () => {
    const pending = await localInvoice();
    await pushOf(pending, "pending");
    expect(await listRow(pending)).toMatchObject({ has_pending_qbo_push: true, was_pushed_to_qbo: false });
    expect(await detail(pending)).toMatchObject({ hasPendingPush: true, wasPushedToQbo: false, payments: [], localPaidCents: 0 });

    const purged = await localInvoice();
    await pushOf(purged, "pushed");
    await changeRealm(purged);
    expect(await listRow(purged)).toMatchObject({ has_pending_qbo_push: false, was_pushed_to_qbo: true, local_paid_cents: 0 });
    expect(await detail(purged)).toMatchObject({ hasPendingPush: false, wasPushedToQbo: true });
  });

  // qbo_pushes is readable by Admin and Sales only, so the push facts come from
  // invoice_push_facts: a warehouse reader must never see such an invoice as ledger-owned.
  it("reports the same push facts to a warehouse reader", async () => {
    const pending = await localInvoice();
    await pushOf(pending, "pending");
    const warehouse = await makeStaffCtx(pending.breweryId, "warehouse");
    expect(await listRow(pending, warehouse)).toMatchObject({ has_pending_qbo_push: true, was_pushed_to_qbo: false });
    expect(await detail(pending, warehouse)).toMatchObject({ hasPendingPush: true, wasPushedToQbo: false });

    const purged = await localInvoice();
    await pushOf(purged, "pushed");
    await changeRealm(purged);
    const purgedWarehouse = await makeStaffCtx(purged.breweryId, "warehouse");
    expect(await listRow(purged, purgedWarehouse)).toMatchObject({ has_pending_qbo_push: false, was_pushed_to_qbo: true });
    expect(await detail(purged, purgedWarehouse)).toMatchObject({ hasPendingPush: false, wasPushedToQbo: true });
  });

  it("refuses push facts to a brewer and to another brewery's staff", async () => {
    const f = await localInvoice();
    const brewer = await makeStaffCtx(f.breweryId, "brewer");
    const other = await makeStaffCtx((await makeBrewery()).id, "warehouse");
    for (const ctx of [brewer, other]) {
      const result = await ctx.db.rpc("invoice_push_facts", { p_brewery: f.breweryId, p_invoices: [f.invoiceId] });
      expect(result.error?.code).toBe("42501");
    }
  });
});

describe("write_off_invoice on an invoice MGR's ledger owns (#1228)", () => {
  /** Calls write_off_invoice as `ctx` (an Admin of the invoice's brewery by default). */
  async function writeOff(f: Fixture, input: Record<string, unknown> = {}, ctx?: Ctx) {
    return (ctx ?? await makeStaffCtx(f.breweryId, "admin")).db.rpc("write_off_invoice", {
      p_brewery: f.breweryId, p_invoice: f.invoiceId, p_reason: "Customer closed", p_request_id: crypto.randomUUID(), ...input,
    });
  }
  const writtenOff = (f: Fixture) =>
    sql(`select (written_off_at is not null)::text || '|' || coalesce(written_off_reason,'') from public.invoices where id='${f.invoiceId}'`, true)[0];

  it("writes off an unpaid invoice QuickBooks never received, with replay and the reason rule", async () => {
    const f = await localInvoice();
    const adminCtx = await makeStaffCtx(f.breweryId, "admin");
    expect((await writeOff(f, { p_reason: "  " }, adminCtx)).error?.message).toMatch(/write-off reason must be 1 to 500 characters/);
    const requestId = crypto.randomUUID();
    const first = await writeOff(f, { p_request_id: requestId, p_reason: "  Customer closed  " }, adminCtx);
    expect(first.error).toBeNull();
    expect(first.data).toEqual({ invoiceId: f.invoiceId, status: "written_off", reason: "Customer closed" });
    expect((await writeOff(f, { p_request_id: requestId, p_reason: "  Customer closed  " }, adminCtx)).data).toEqual(first.data);
    expect(writtenOff(f)).toBe("true|Customer closed");
    expect((await writeOff(f, {}, adminCtx)).error?.message).toMatch(/can be written off/);
  });

  it("writes off a partly paid invoice for its remaining balance and keeps the payments (owner decision)", async () => {
    const f = await localInvoice();
    expect((await record(f, { p_amount_cents: 4000 })).error).toBeNull();
    expect((await writeOff(f)).error).toBeNull();
    expect(writtenOff(f)).toBe("true|Customer closed");
    expect(sql(`select local_paid_cents from public.invoice_totals where invoice_id='${f.invoiceId}'`, true)).toEqual(["4000"]);
    expect(paidAtLocal(f)).toBe("");
    expect((await record(f, { p_amount_cents: 100 })).error?.message).toMatch(/a written-off invoice takes no payment/);
  });

  it("still refuses a paid, pushed, pending or QuickBooks invoice, a credit memo, and Sales", async () => {
    const paid = await localInvoice();
    expect((await record(paid, { p_amount_cents: 10000 })).error).toBeNull();
    const historical = await localInvoice({ paid_at: new Date().toISOString(), qbo_sync_status: "not_synced" });
    const pending = await localInvoice();
    await pushOf(pending, "pending");
    const purged = await localInvoice();
    await pushOf(purged, "pushed");
    await changeRealm(purged);
    const live = await localInvoice({ qbo_invoice_id: "remote-9", qbo_sync_status: "pushed" });
    const memo = await localInvoice({ kind: "credit_memo" });
    for (const [name, f] of Object.entries({ paid, historical, pending, purged, live, memo })) {
      expect((await writeOff(f)).error?.message, name).toMatch(/can be written off/);
      expect(writtenOff(f), name).toBe("false|");
    }
    const unpaid = await localInvoice();
    expect((await writeOff(unpaid, {}, unpaid.sales)).error?.code).toBe("42501");
  });
});
