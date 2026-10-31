// #414: a credit memo refunds returned kegs' deposits. Crediting a keg_deposit
// invoice line writes a keg_deposit_refund line (negative whole kegs, the
// deposit's pool and size, the deposit's frozen price), which reduces
// keg_deposit_balances. Beer lines keep their return_in path.
import { beforeEach, describe, expect, it } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import type { Json } from "@/lib/supabase/database.generated";
import "@/lib/commands/all";
import { admin, asUser, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";

describe("keg deposit refund credit memo", () => {
  let f: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { f = await setup(); });

  it("#815 records shipped shells even when the source has no recorded shell balance", async () => {
    const invoiceId = await shipTwoKegs(f);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const sku = await admin.from("skus").select("keg_pool_id").eq("id", f.keg.skuId).single();
    expect(sku.error).toBeNull();
    const events = await admin.from("keg_events").select("reason,qty,pool_id,keg_size,customer_id,shipment_id,location_id,bin_id")
      .eq("shipment_id", invoice.data!.shipment_id!);
    expect(events.error).toBeNull();
    expect(events.data).toEqual([{
      reason: "shipped", qty: 2, pool_id: sku.data!.keg_pool_id, keg_size: "half_bbl",
      customer_id: f.customer.customerId, shipment_id: invoice.data!.shipment_id,
      location_id: f.source.id, bin_id: f.source.binId,
    }]);
    const customerBalance = await admin.from("keg_customer_balances").select("qty").eq("customer_id", f.customer.customerId);
    expect(customerBalance.error).toBeNull();
    expect(customerBalance.data?.map(row => Number(row.qty))).toEqual([2]);
    const binBalance = await f.adminCtx.db.from("keg_bin_on_hand").select("qty").eq("bin_id", f.source.binId).eq("pool_id", sku.data!.keg_pool_id!);
    expect(binBalance.error).toBeNull();
    expect(binBalance.data?.map(row => Number(row.qty))).toEqual([-2]);
    const shipment = await admin.from("shipments").select("order_id").eq("id", invoice.data!.shipment_id!).single();
    expect(shipment.error).toBeNull();
    const event = await admin.from("order_events").select("payload").eq("order_id", shipment.data!.order_id!).eq("event", "shipped").single();
    expect(event.error).toBeNull();
    expect(event.data!.payload).toMatchObject({ warnings: [{ pool: "Returnable fleet", keg_size: "half_bbl", location: "Deposit warehouse", short: 2 }] });
  });

  it("#815 records the shell returned with a full keg of beer, not a deposit-only refund", async () => {
    const invoiceId = await shipTwoKegs(f);
    const line = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "sku").single();
    expect(line.error).toBeNull();
    await runCommand("return_shipment", { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: line.data!.id, qty: 1 }] }, f.adminCtx);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const events = await admin.from("keg_events").select("reason,qty,bin_id").eq("shipment_id", invoice.data!.shipment_id!).order("reason");
    expect(events.error).toBeNull();
    expect(events.data).toHaveLength(2);
    expect(events.data).toEqual(expect.arrayContaining([{ reason: "returned", qty: 1, bin_id: f.source.binId }, { reason: "shipped", qty: 2, bin_id: f.source.binId }]));
  });

  it("#815 returns zero-deposit shells after the SKU pool is cleared", async () => {
    const sku = await admin.from("skus").select("keg_pool_id").eq("id", f.keg.skuId).single();
    expect(sku.error).toBeNull();
    const poolId = sku.data!.keg_pool_id!;
    expect((await admin.from("keg_pools").update({ deposit_cents: 0 }).eq("id", poolId)).error).toBeNull();
    const invoiceId = await shipTwoKegs(f);
    expect((await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit")).data).toEqual([]);
    expect((await admin.from("skus").update({ keg_pool_id: null, container_source: null }).eq("id", f.keg.skuId)).error).toBeNull();
    const line = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "sku").single();
    expect(line.error).toBeNull();
    await runCommand("return_shipment", { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: line.data!.id, qty: 1 }] }, f.adminCtx);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const returned = await admin.from("keg_events").select("pool_id,keg_size,qty").eq("shipment_id", invoice.data!.shipment_id!).eq("reason", "returned");
    expect(returned.error).toBeNull();
    expect(returned.data).toEqual([{ pool_id: poolId, keg_size: "half_bbl", qty: 1 }]);
  });

  it("#815 returns the physically shipped pool when relinking happened after the deposit was frozen", async () => {
    const replacement = await ins("keg_pools", { brewery_id: f.brewery.id, name: "Filled replacement fleet", kind: "owned", deposit_cents: 3000 });
    const invoiceId = await shipTwoKegs(f, async () => {
      expect((await admin.from("skus").update({ keg_pool_id: replacement.id, container_source: "owned_fleet" }).eq("id", f.keg.skuId)).error).toBeNull();
    });
    const deposit = await admin.from("invoice_lines").select("keg_pool_id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single();
    expect(deposit.error).toBeNull();
    expect(deposit.data!.keg_pool_id).not.toBe(replacement.id);
    const line = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "sku").single();
    expect(line.error).toBeNull();
    await runCommand("return_shipment", { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: line.data!.id, qty: 1 }] }, f.adminCtx);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const events = await admin.from("keg_events").select("reason,pool_id,keg_size,qty").eq("shipment_id", invoice.data!.shipment_id!);
    expect(events.error).toBeNull();
    expect(events.data).toHaveLength(2);
    expect(events.data).toEqual(expect.arrayContaining([
      { reason: "shipped", pool_id: replacement.id, keg_size: "half_bbl", qty: 2 },
      { reason: "returned", pool_id: replacement.id, keg_size: "half_bbl", qty: 1 },
    ]));
  });

  it.each(["clear", "relink"])("#815 returns the shipped pool after the SKU pool is changed (%s)", async change => {
    const invoiceId = await shipTwoKegs(f);
    const original = await admin.from("invoice_lines").select("keg_pool_id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single();
    expect(original.error).toBeNull();
    const replacement = change === "relink" ? await ins("keg_pools", { brewery_id: f.brewery.id, name: "Replacement fleet", kind: "owned" }) : null;
    expect((await admin.from("skus").update({ keg_pool_id: replacement?.id ?? null, container_source: replacement ? "owned_fleet" : null }).eq("id", f.keg.skuId)).error).toBeNull();
    const line = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "sku").single();
    expect(line.error).toBeNull();
    await runCommand("return_shipment", { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: line.data!.id, qty: 1 }] }, f.adminCtx);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const returned = await admin.from("keg_events").select("pool_id,keg_size,qty").eq("shipment_id", invoice.data!.shipment_id!).eq("reason", "returned");
    expect(returned.error).toBeNull();
    expect(returned.data).toEqual([{ pool_id: original.data!.keg_pool_id, keg_size: "half_bbl", qty: 1 }]);
  });

  it("#815 warns when the location is negative even if another bin can supply this shipment", async () => {
    const sku = await admin.from("skus").select("keg_pool_id").eq("id", f.keg.skuId).single();
    expect(sku.error).toBeNull();
    const shellBin = await ins("bins", { brewery_id: f.brewery.id, location_id: f.source.id, name: "A shells" });
    await runCommand("record_keg_event", { poolId: sku.data!.keg_pool_id, kegSize: "half_bbl", qty: 2, reason: "acquired", locationId: f.source.id, binId: shellBin.id }, f.adminCtx);
    await ins("keg_events", { brewery_id: f.brewery.id, pool_id: sku.data!.keg_pool_id!, keg_size: "half_bbl", qty: 4, reason: "shipped", location_id: f.source.id, bin_id: f.source.binId, customer_id: f.customer.customerId, created_by: f.adminCtx.userId });
    const invoiceId = await shipTwoKegs(f);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const shipment = await admin.from("shipments").select("order_id").eq("id", invoice.data!.shipment_id!).single();
    expect(shipment.error).toBeNull();
    const event = await admin.from("order_events").select("payload").eq("order_id", shipment.data!.order_id!).eq("event", "shipped").single();
    expect(event.error).toBeNull();
    expect(event.data!.payload).toMatchObject({ warnings: [{ pool: "Returnable fleet", keg_size: "half_bbl", location: "Deposit warehouse", short: 4 }] });
    // Keg fleet reads the same location net, not the drained bin alone.
    const fleet = await runCommand("get_keg_fleet", {}, f.adminCtx) as { shortages: unknown[] };
    expect(fleet.shortages).toEqual([{ pool: "Returnable fleet", keg_size: "half_bbl", location: "Deposit warehouse", short: 4 }]);
  });

  it("#815 drains shell bins by name, posts only the remainder below zero, and ignores later pool retirement", async () => {
    const sku = await admin.from("skus").select("keg_pool_id").eq("id", f.keg.skuId).single();
    expect(sku.error).toBeNull();
    const shellBin = await ins("bins", { brewery_id: f.brewery.id, location_id: f.source.id, name: "A shells" });
    await runCommand("record_keg_event", { poolId: sku.data!.keg_pool_id, kegSize: "half_bbl", qty: 1, reason: "acquired", locationId: f.source.id, binId: shellBin.id }, f.adminCtx);
    expect((await admin.from("keg_pools").update({ active: false }).eq("id", sku.data!.keg_pool_id!)).error).toBeNull();
    const invoiceId = await shipTwoKegs(f);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    const events = await admin.from("keg_events").select("qty,bin_id").eq("shipment_id", invoice.data!.shipment_id!);
    expect(events.error).toBeNull();
    expect(events.data).toEqual([{ qty: 1, bin_id: shellBin.id }, { qty: 1, bin_id: shellBin.id }]);
    await expect(runCommand("record_keg_event", { poolId: sku.data!.keg_pool_id, kegSize: "half_bbl", qty: 1, reason: "shipped", locationId: f.source.id, binId: shellBin.id, customerId: f.customer.customerId }, f.adminCtx)).rejects.toThrow(/out of service/);
  });

  it("#815 does not post Returned shells for a historical shipment without automatic Shipped events", async () => {
    const invoiceId = await shipTwoKegs(f);
    const invoice = await admin.from("invoices").select("shipment_id").eq("id", invoiceId).single();
    expect(invoice.error).toBeNull();
    // A pre-migration shipment has neither automatic Shipped events nor a keg_shells snapshot.
    expect((await admin.from("keg_events").delete().eq("shipment_id", invoice.data!.shipment_id!)).error).toBeNull();
    const shipment = await admin.from("shipments").select("order_id").eq("id", invoice.data!.shipment_id!).single();
    expect(shipment.error).toBeNull();
    const shipped = await admin.from("order_events").select("id,payload").eq("order_id", shipment.data!.order_id!).eq("event", "shipped").single();
    expect(shipped.error).toBeNull();
    const legacy = { ...(shipped.data!.payload as { [key: string]: Json | undefined }) };
    delete legacy.keg_shells;
    expect((await admin.from("order_events").update({ payload: legacy }).eq("id", shipped.data!.id)).error).toBeNull();
    const line = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "sku").single();
    expect(line.error).toBeNull();
    const requestId = crypto.randomUUID();
    const input = { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: line.data!.id, qty: 1 }] };
    const returned = await runCommand("return_shipment", input, f.adminCtx, { requestId, correlationId: requestId });
    expect(await runCommand("return_shipment", input, f.adminCtx, { requestId, correlationId: requestId })).toEqual(returned);
    const events = await admin.from("keg_events").select("id").eq("shipment_id", invoice.data!.shipment_id!);
    expect(events.error).toBeNull();
    expect(events.data).toEqual([]);
  });

  it("checks empty kegs in with the deposit refund atomically and replays once", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single().throwOnError();
    const requestId = crypto.randomUUID();
    const input = { invoiceId, locationId: f.source.id, binId: f.source.binId, returnEmptyKegs: true, lines: [{ invoiceLineId: deposit.data!.id, qty: 1 }] };
    const result = await runCommand("return_shipment", input, f.adminCtx, { requestId, correlationId: requestId });
    expect(await runCommand("return_shipment", input, f.adminCtx, { requestId, correlationId: requestId })).toEqual(result);
    expect((await admin.from("keg_customer_balances").select("qty").eq("customer_id", f.customer.customerId)).data).toEqual([{ qty: 1 }]);
    expect((await admin.from("keg_events").select("qty,bin_id").eq("customer_id", f.customer.customerId).eq("reason", "returned")).data)
      .toEqual([{ qty: 1, bin_id: f.source.binId }]);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });
  });

  it("refunds a deposit without asking for unused return facts or posting a shell return", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single().throwOnError();
    await runCommand("return_shipment", { invoiceId, lines: [{ invoiceLineId: deposit.data!.id, qty: 1 }] }, f.adminCtx);
    expect((await admin.from("keg_events").select("id").eq("customer_id", f.customer.customerId).eq("reason", "returned")).data).toEqual([]);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });
  });

  it("rolls the refund back if the same empty kegs were already checked in", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = await admin.from("invoice_lines").select("id,keg_pool_id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single().throwOnError();
    await runCommand("record_keg_event", { poolId: deposit.data!.keg_pool_id, kegSize: "half_bbl", qty: 2, reason: "returned",
      customerId: f.customer.customerId, locationId: f.source.id, binId: f.source.binId }, f.adminCtx);
    await expect(runCommand("return_shipment", { invoiceId, returnEmptyKegs: true, locationId: f.source.id, binId: f.source.binId,
      lines: [{ invoiceLineId: deposit.data!.id, qty: 1 }] }, f.adminCtx)).rejects.toThrow(/customer balance|already returned/i);
    expect(await balance(f)).toEqual({ kegs: 2, cents: 5000 });
    expect((await admin.from("invoice_lines").select("id").eq("credited_invoice_line_id", deposit.data!.id)).data).toEqual([]);
  });

  it("refunds one keg's deposit as a keg_deposit_refund line and reduces the customer's deposit balance", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = (await admin.from("invoice_lines").select("id,keg_pool_id,keg_size,unit_price_cents").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    expect(await balance(f)).toEqual({ kegs: 2, cents: 5000 });

    const result = await runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 1 }],
    }, f.adminCtx) as { credit_memo_id: string };
    const refund = await admin.from("invoice_lines").select("kind,keg_pool_id,keg_size,qty,unit_price_cents,amount_cents,credited_invoice_line_id,sku_id").eq("invoice_id", result.credit_memo_id);
    expect(refund.error).toBeNull();
    expect(refund.data).toEqual([{
      kind: "keg_deposit_refund", keg_pool_id: deposit.keg_pool_id, keg_size: deposit.keg_size, qty: -1,
      unit_price_cents: deposit.unit_price_cents, amount_cents: -2500, credited_invoice_line_id: deposit.id, sku_id: null,
    }]);
    const moved = await admin.from("inventory_movements").select("id").eq("ref", result.credit_memo_id);
    expect(moved.data).toEqual([]);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });

    await expect(runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 2 }],
    }, f.adminCtx)).rejects.toThrow(/exceeds remaining/);
    await expect(runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 0.5 }],
    }, f.adminCtx)).rejects.toThrow(/whole kegs/);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });
  });

  // #577: the refund and the Returned keg event stay separate, so the balance
  // and the report flag a customer whose kegs on deposit disagree with kegs out.
  it("flags a refunded deposit whose kegs on deposit disagree with kegs out plus kegs lost", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = (await admin.from("invoice_lines").select("id,keg_pool_id,keg_size").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    const pool = deposit.keg_pool_id!, size = deposit.keg_size!;
    const wh = await makeStaffCtx(f.brewery.id, "warehouse");
    const keg = (qty: number, reason: string) => runCommand("record_keg_event", {
      poolId: pool, kegSize: size, qty, reason, locationId: f.source.id, binId: f.source.binId,
      ...(reason === "acquired" ? {} : { customerId: f.customer.customerId }),
    }, wh);
    const flagged = async () => {
      const b = await runCommand("get_customer_keg_balance", { customerId: f.customer.customerId }, wh) as { rows: { kegs_out: number; kegs_on_deposit: number; mismatch: boolean }[] };
      const r = await runCommand("get_keg_report", {}, wh) as { mismatches: { customer_id: string; kegs_out: number; kegs_on_deposit: number }[] };
      return { balance: b.rows.map((x) => [x.kegs_out, x.kegs_on_deposit, x.mismatch]), report: r.mismatches.map((m) => [m.customer_id, m.kegs_out, m.kegs_on_deposit]) };
    };

    // Shipping posts both physical shells and deposits; refund remains separate.
    await keg(10, "acquired");
    expect(await flagged()).toEqual({ balance: [[2, 2, false]], report: [] });
    // One deposit refunded while both kegs are still out.
    await runCommand("return_shipment", { invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 1 }] }, f.adminCtx);
    expect(await flagged()).toEqual({ balance: [[2, 1, true]], report: [[f.customer.customerId, 2, 1]] });
    await keg(1, "returned");
    expect(await flagged()).toEqual({ balance: [[1, 1, false]], report: [] });
    // The last keg is lost at the customer: its deposit is kept, so still no flag.
    await keg(1, "lost");
    expect(await flagged()).toEqual({ balance: [[0, 1, false]], report: [] });
  });
});

// #617: a voided, deleted, or written-off invoice is no longer owed, so the
// deposit it charged is not held, and a refund of that deposit is not owed back.
describe("keg deposit balance on voided and written-off invoices", () => {
  let f: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { f = await setup(); });
  const setState = async (id: string, patch: { qbo_remote_state?: "voided" | "deleted"; written_off_at?: string; written_off_reason?: string; written_off_by?: string }) =>
    expect((await admin.from("invoices").update(patch).eq("id", id)).error).toBeNull();
  const refundOne = async (invoiceId: string) => {
    const deposit = (await admin.from("invoice_lines").select("id").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    return (await runCommand("return_shipment", {
      invoiceId, locationId: f.source.id, reason: "unsold", lines: [{ invoiceLineId: deposit.id, qty: 1 }],
    }, f.adminCtx) as { credit_memo_id: string }).credit_memo_id;
  };

  it.each([
    ["voided in QuickBooks", { qbo_remote_state: "voided" as const }],
    ["deleted in QuickBooks", { qbo_remote_state: "deleted" as const }],
    ["written off", { written_off_at: new Date().toISOString(), written_off_reason: "uncollectable" }],
  ])("drops a deposit invoice %s, leaving the physical keg balance alone", async (_state, patch) => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = (await admin.from("invoice_lines").select("keg_pool_id,keg_size").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    await runCommand("record_keg_event", {
      poolId: deposit.keg_pool_id, kegSize: deposit.keg_size, qty: 2, reason: "acquired", locationId: f.source.id, binId: f.source.binId,
    }, f.adminCtx);
    expect(await balance(f)).toEqual({ kegs: 2, cents: 5000 });
    await setState(invoiceId, "written_off_at" in patch ? { ...patch, written_off_by: f.adminCtx.userId } : patch);
    expect(await balance(f)).toEqual({ kegs: 0, cents: 0 });
    const kegs = await admin.from("keg_customer_balances").select("qty").eq("customer_id", f.customer.customerId);
    expect(kegs.data?.map((r) => Number(r.qty))).toEqual([2]);
  });

  it("nets a partial refund, and drops the refund once its credit memo is voided", async () => {
    const invoiceId = await shipTwoKegs(f);
    const memo = await refundOne(invoiceId);
    expect(await balance(f)).toEqual({ kegs: 1, cents: 2500 });
    await setState(memo, { qbo_remote_state: "voided" });
    expect(await balance(f)).toEqual({ kegs: 2, cents: 5000 });
  });

  it("stops treating a row as refunded once the refund's credit memo is voided", async () => {
    const invoiceId = await shipTwoKegs(f);
    const deposit = (await admin.from("invoice_lines").select("keg_pool_id,keg_size").eq("invoice_id", invoiceId).eq("kind", "keg_deposit").single()).data!;
    for (const [qty, reason] of [[2, "acquired"], [1, "returned"]] as const) {
      await runCommand("record_keg_event", {
        poolId: deposit.keg_pool_id, kegSize: deposit.keg_size, qty, reason, locationId: f.source.id, binId: f.source.binId,
        ...(reason === "returned" ? { customerId: f.customer.customerId } : {}),
      }, f.adminCtx);
    }
    const mismatch = async () => ((await runCommand("get_customer_keg_balance", { customerId: f.customer.customerId }, f.adminCtx)) as { rows: { mismatch: boolean }[] }).rows.map((r) => r.mismatch);
    const memo = await refundOne(invoiceId);
    expect(await mismatch()).toEqual([false]); // 1 out, 1 on deposit
    await setState(memo, { qbo_remote_state: "voided" });
    // 1 out, 2 on deposit again, but no live refund: not flagged, like before any refund.
    expect(await mismatch()).toEqual([false]);
  });

  it("drops a refund whose source deposit invoice was voided after the refund", async () => {
    const invoiceId = await shipTwoKegs(f);
    await refundOne(invoiceId);
    await setState(invoiceId, { qbo_remote_state: "voided" });
    expect(await balance(f)).toEqual({ kegs: 0, cents: 0 });
  });
});

async function setup() {
  const brewery = await makeBrewery();
  const adminCtx = await makeStaffCtx(brewery.id);
  const source = await seedLocation(brewery.id, { name: "Deposit warehouse" });
  const keg = await seedCatalog(brewery.id, { product: "Refund keg", sku: "Refund keg half", packageType: "keg", bblPerUnit: 0.5 });
  const customer = await seedCustomer(brewery.id);
  const pool = await admin.from("keg_pools").insert({ brewery_id: brewery.id, name: "Returnable fleet", kind: "owned", deposit_cents: 2500 }).select("id").single();
  expect(pool.error).toBeNull();
  expect((await admin.from("skus").update({ container_source: "owned_fleet", keg_pool_id: pool.data!.id }).eq("id", keg.skuId)).error).toBeNull();
  await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: keg.brandId, formatId: keg.formatId, cents: 3600 });
  await ins("inventory_movements", { brewery_id: brewery.id, sku_id: keg.skuId, location_id: source.id, bin_id: source.binId, qty: 20, type: "opening_balance", created_by: adminCtx.userId });
  await runCommand("set_portal_fulfillment_source", { locationId: source.id }, adminCtx);
  const buyer = await makeCustomerUser(customer.customerId);
  const db = await asUser(buyer.email);
  return { brewery, adminCtx, source, keg, customer,
    portalCtx: { db, userId: buyer.id, breweryId: brewery.id, roles: ["customer" as const], customerId: customer.customerId } };
}

async function shipTwoKegs(f: Awaited<ReturnType<typeof setup>>, beforeShip?: () => Promise<void>) {
  const quote = await runCommand("portal_quote_order", { shipToId: f.customer.shipToId, lines: [{ skuId: f.keg.skuId, qty: 2 }] }, f.portalCtx) as { quoteId: string };
  const { order_id: orderId } = await runCommand("portal_submit_quote", { quoteId: quote.quoteId }, f.portalCtx) as { order_id: string };
  await runCommand("confirm_order", { orderId }, f.adminCtx);
  const lines = (await admin.from("order_lines").select("id,qty_ordered").eq("order_id", orderId)).data!;
  await runCommand("record_pick", { orderId, picks: lines.map(line => ({ lineId: line.id, qty: Number(line.qty_ordered) })) }, f.adminCtx);
  await beforeShip?.();
  const shipped = await runCommand("ship_order", { orderId, invoiceTiming: "now", ship: lines.map(line => ({ lineId: line.id, qty: Number(line.qty_ordered), sources: [{ binId: f.source.binId, lotId: null, qty: Number(line.qty_ordered) }] })) }, f.adminCtx) as { invoice_id: string };
  return shipped.invoice_id;
}

async function balance(f: Awaited<ReturnType<typeof setup>>) {
  const rows = await admin.from("keg_deposit_balances").select("kegs_on_deposit,deposit_cents").eq("customer_id", f.customer.customerId);
  expect(rows.error).toBeNull();
  expect(rows.data!.length).toBeLessThanOrEqual(1);
  const row = rows.data![0];
  const result = { kegs: row?.kegs_on_deposit ?? 0, cents: row?.deposit_cents ?? 0 };
  // #754: the buyer reads the same deposit through portal_keg_deposits.
  const account = await runCommand("get_portal_account", {}, f.portalCtx) as { deposits: { kegsOnDeposit: number; depositCents: number }[] };
  expect(account.deposits).toEqual(result.kegs ? [expect.objectContaining({ kegsOnDeposit: result.kegs, depositCents: result.cents })] : []);
  return result;
}
