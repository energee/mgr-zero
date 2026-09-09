import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { runCommand } from "@/lib/commands/registry";
import { admin, asUser, makeBrewery, makeStaff, seedCatalog, seedCustomer, seedLocation, priceSku, sql } from "./helpers";
import "@/lib/commands/all";

describe("request context headers", () => {
  let actor: { id: string; email: string };
  let breweryA: string;
  let breweryB: string;
  let orderId: string;
  let transferId: string;
  let customerA: string;
  let customerB: string;
  let invoiceB: string;

  async function db(headers?: Record<string, string>) {
    const client = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
      auth: { persistSession: false },
      ...(headers ? { global: { headers } } : {}),
    });
    const { error } = await client.auth.signInWithPassword({ email: actor.email, password: "test-password-1" });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    breweryA = (await makeBrewery()).id;
    breweryB = (await makeBrewery()).id;
    actor = await makeStaff(breweryA, "admin");
    await admin.from("brewery_users").insert({ brewery_id: breweryB, user_id: actor.id, role: "admin" });
    const actorDb = await asUser(actor.email);
    const ctxB = { db: actorDb, userId: actor.id, breweryId: breweryB, role: "admin" as const };
    const catalog = await seedCatalog(breweryB);
    const customer = await seedCustomer(breweryB);
    customerA = customer.customerId;
    customerB = (await seedCustomer(breweryB, { name: "Other owned customer" })).customerId;
    await admin.from("customer_users").insert([
      { customer_id: customerA, user_id: actor.id },
      { customer_id: customerB, user_id: actor.id },
    ]);
    invoiceB = (await admin.from("invoices").insert({ brewery_id: breweryB, customer_id: customerB, kind: "invoice" }).select("id").single()).data!.id;
    const from = await seedLocation(breweryB, { name: "B from" });
    const to = await seedLocation(breweryB, { name: "B to" });
    await priceSku(breweryB, { saleChannelId: customer.saleChannelId, brandId: catalog.brandId, formatId: catalog.formatId, cents: 1000 });
    orderId = (await runCommand("create_order", {
      kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId,
      fromLocationId: from.id, lines: [{ skuId: catalog.skuId, qty: 1 }],
    }, ctxB) as { order_id: string }).order_id;
    transferId = (await runCommand("create_stock_transfer", {
      fromLocationId: from.id, toLocationId: to.id,
      lines: [{ skuId: catalog.skuId, qty: 1, fromBinId: from.binId, toBinId: to.binId }],
    }, ctxB) as { transferId: string }).transferId;
  });

  it("blocks cross-brewery target claims and replays before effects", async () => {
    const requestId = crypto.randomUUID();
    const wrong = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryA });
    const refused = await wrong.rpc("submit_order", { p_order: orderId, p_request_id: requestId });
    expect(refused.error?.code).toBe("42501");
    expect((await admin.from("orders").select("status").eq("id", orderId).single()).data?.status).toBe("draft");
    expect(sql(`select count(*) from private.command_requests where actor_id='${actor.id}' and request_id='${requestId}'`)).toEqual(["0"]);

    const correct = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryB });
    const first = await correct.rpc("submit_order", { p_order: orderId, p_request_id: requestId });
    expect(first.error).toBeNull();
    expect((await correct.rpc("submit_order", { p_order: orderId, p_request_id: requestId })).data).toEqual(first.data);
    expect((await wrong.rpc("submit_order", { p_order: orderId, p_request_id: requestId })).error?.code).toBe("42501");
  });

  it("covers another resource-derived write and keeps raw no-header compatibility", async () => {
    const wrong = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryA });
    const refusedId = crypto.randomUUID();
    expect((await wrong.rpc("submit_stock_transfer", { p_transfer: transferId, p_request_id: refusedId })).error?.code).toBe("42501");
    expect(sql(`select count(*) from private.command_requests where actor_id='${actor.id}' and request_id='${refusedId}'`)).toEqual(["0"]);

    const unscoped = await db();
    expect((await unscoped.rpc("submit_stock_transfer", { p_transfer: transferId, p_request_id: crypto.randomUUID() })).error).toBeNull();
  });

  it("fails closed for malformed or forged actor scope", async () => {
    for (const actorHeader of ["not-a-uuid", crypto.randomUUID()]) {
      const scoped = await db({ "x-mgr-actor-id": actorHeader, "x-mgr-brewery-id": breweryB });
      const requestId = crypto.randomUUID();
      expect((await scoped.rpc("update_brewery", {
        p_brewery: breweryB, p_name: "Blocked", p_timezone: "UTC", p_ttb_registry_no: null,
        p_pa_license_no: null, p_customer_phone: null,
        p_reading_due_hours: 24, p_request_id: requestId,
      })).error?.code).toBe("42501");
      expect(sql(`select count(*) from private.command_requests where actor_id='${actor.id}' and request_id='${requestId}'`)).toEqual(["0"]);
    }
  });

  it("restricts a multi-account portal question to the rendered customer", async () => {
    const requestId = crypto.randomUUID();
    const wrong = await db({
      "x-mgr-actor-id": actor.id,
      "x-mgr-brewery-id": breweryB,
      "x-mgr-customer-id": customerA,
    });
    expect((await wrong.rpc("raise_invoice_question", {
      p_brewery: breweryB, p_invoice: invoiceB, p_body: "Wrong account", p_request_id: requestId,
    })).error?.code).toBe("42501");
    expect(sql(`select count(*) from private.command_requests where actor_id='${actor.id}' and request_id='${requestId}'`)).toEqual(["0"]);

    const correct = await db({
      "x-mgr-actor-id": actor.id,
      "x-mgr-brewery-id": breweryB,
      "x-mgr-customer-id": customerB,
    });
    expect((await correct.rpc("raise_invoice_question", {
      p_brewery: breweryB, p_invoice: invoiceB, p_body: "Correct account", p_request_id: requestId,
    })).error).toBeNull();
  });
});
