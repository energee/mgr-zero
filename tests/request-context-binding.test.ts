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
  let deliveryId: string;
  let customerA: string;
  let customerB: string;
  let invoiceB: string;
  let resourcesA: { orderId: string; transferId: string; deliveryId: string; customerId: string; invoiceId: string };

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
    const bAdmin = await makeStaff(breweryB, "admin");
    const bAdminDb = await asUser(bAdmin.email);
    const ctxB = { db: bAdminDb, userId: bAdmin.id, breweryId: breweryB, role: "admin" as const };
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
    const routeB = (await admin.from("routes").insert({ brewery_id: breweryB, delivery_date: "2026-09-09" }).select("id").single()).data!;
    deliveryId = (await admin.from("deliveries").insert({ brewery_id: breweryB, route_id: routeB.id, stock_transfer_id: transferId, stop_no: 1 }).select("id").single()).data!.id;

    const actorDb = await asUser(actor.email);
    const ctxA = { db: actorDb, userId: actor.id, breweryId: breweryA, role: "admin" as const };
    const catalogA = await seedCatalog(breweryA);
    const customerOwnedA = await seedCustomer(breweryA);
    await admin.from("customer_users").insert({ customer_id: customerOwnedA.customerId, user_id: actor.id });
    const fromA = await seedLocation(breweryA, { name: "A from" });
    const toA = await seedLocation(breweryA, { name: "A to" });
    await priceSku(breweryA, { saleChannelId: customerOwnedA.saleChannelId, brandId: catalogA.brandId, formatId: catalogA.formatId, cents: 900 });
    const orderA = (await runCommand("create_order", { kind: "wholesale", customerId: customerOwnedA.customerId, shipToId: customerOwnedA.shipToId, fromLocationId: fromA.id, lines: [{ skuId: catalogA.skuId, qty: 1 }] }, ctxA) as { order_id: string }).order_id;
    const transferA = (await runCommand("create_stock_transfer", { fromLocationId: fromA.id, toLocationId: toA.id, lines: [{ skuId: catalogA.skuId, qty: 1, fromBinId: fromA.binId, toBinId: toA.binId }] }, ctxA) as { transferId: string }).transferId;
    const routeA = (await admin.from("routes").insert({ brewery_id: breweryA, delivery_date: "2026-09-09" }).select("id").single()).data!;
    const deliveryA = (await admin.from("deliveries").insert({ brewery_id: breweryA, route_id: routeA.id, stock_transfer_id: transferA, stop_no: 1 }).select("id").single()).data!.id;
    const invoiceA = (await admin.from("invoices").insert({ brewery_id: breweryA, customer_id: customerOwnedA.customerId, kind: "invoice" }).select("id").single()).data!.id;
    resourcesA = { orderId: orderA, transferId: transferA, deliveryId: deliveryA, customerId: customerOwnedA.customerId, invoiceId: invoiceA };
  });

  it("limits selected-context reads across detail families while preserving explicit switching", async () => {
    const scopedA = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryA });
    const ctxA = { db: scopedA, userId: actor.id, breweryId: breweryA, role: "admin" as const };
    for (const [name, key, own, foreign] of [
      ["get_order", "orderId", resourcesA.orderId, orderId],
      ["get_invoice", "invoiceId", resourcesA.invoiceId, invoiceB],
      ["get_customer", "customerId", resourcesA.customerId, customerA],
      ["get_stock_transfer", "transferId", resourcesA.transferId, transferId],
      ["get_delivery_stop", "deliveryId", resourcesA.deliveryId, deliveryId],
    ] as const) {
      await expect(runCommand(name, { [key]: own }, ctxA)).resolves.toBeTruthy();
      await expect(runCommand(name, { [key]: foreign }, ctxA)).rejects.toBeTruthy();
    }

    const limited = await makeStaff(breweryA, "admin");
    await admin.from("brewery_users").insert({ brewery_id: breweryB, user_id: limited.id, role: "brewer" });
    const limitedDb = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
      auth: { persistSession: false }, global: { headers: { "x-mgr-actor-id": limited.id, "x-mgr-brewery-id": breweryB } },
    });
    expect((await limitedDb.auth.signInWithPassword({ email: limited.email, password: "test-password-1" })).error).toBeNull();
    await expect(runCommand("get_customer", { customerId: customerA }, { db: limitedDb, userId: limited.id, breweryId: breweryB, role: "brewer" })).rejects.toThrow(/permission denied/);

    const switchedB = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryB });
    const ctxB = { db: switchedB, userId: actor.id, breweryId: breweryB, role: "admin" as const };
    await expect(runCommand("get_order", { orderId }, ctxB)).resolves.toMatchObject({ order: { id: orderId } });
  });

  it("scopes raw, embedded, view, projection, and simultaneous clients without narrowing discovery", async () => {
    const [scopedA, scopedB] = await Promise.all([
      db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryA }),
      db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryB }),
    ]);
    const [aOrders, bOrders, aView, bView, aProjection, bProjection] = await Promise.all([
      scopedA.from("orders").select("id, order_lines(id)"),
      scopedB.from("orders").select("id, order_lines(id)"),
      scopedA.from("sku_prices").select("brewery_id"),
      scopedB.from("sku_prices").select("brewery_id"),
      scopedA.from("staff_brewery").select("id"),
      scopedB.from("staff_brewery").select("id"),
    ]);
    for (const result of [aOrders, bOrders, aView, bView, aProjection, bProjection]) expect(result.error).toBeNull();
    expect(aOrders.data?.every(row => row.id !== orderId)).toBe(true);
    expect(bOrders.data?.every(row => row.id !== resourcesA.orderId)).toBe(true);
    expect(aView.data?.every(row => row.brewery_id === breweryA)).toBe(true);
    expect(bView.data?.every(row => row.brewery_id === breweryB)).toBe(true);
    expect(aProjection.data).toEqual([{ id: breweryA }]);
    expect(bProjection.data).toEqual([{ id: breweryB }]);

    const [portalA, portalB] = await Promise.all([
      db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryA, "x-mgr-customer-id": resourcesA.customerId }),
      db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryB, "x-mgr-customer-id": customerB }),
    ]);
    expect((await portalA.from("portal_brewery").select("id")).data).toEqual([{ id: breweryA }]);
    expect((await portalB.from("portal_brewery").select("id")).data).toEqual([{ id: breweryB }]);
    expect((await portalA.from("customer_users").select("customer_id").eq("user_id", actor.id)).data).toEqual([{ customer_id: resourcesA.customerId }]);
    expect((await portalB.from("customer_users").select("customer_id").eq("user_id", actor.id)).data).toEqual([{ customer_id: customerB }]);
    expect((await portalB.from("orders").select("id")).data).toEqual([]);

    const unscoped = await db();
    expect((await unscoped.from("brewery_users").select("brewery_id").eq("user_id", actor.id)).data?.map(row => row.brewery_id).sort())
      .toEqual([breweryA, breweryB].sort());

    for (const headers of [
      { "x-mgr-actor-id": "not-a-uuid", "x-mgr-brewery-id": breweryA },
      { "x-mgr-actor-id": crypto.randomUUID(), "x-mgr-brewery-id": breweryA },
      { "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": "not-a-uuid" },
    ]) {
      const denied = await db(headers);
      const result = await denied.from("orders").select("id");
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
  });

  it("scopes security-definer staff reads, including direct membership projections", async () => {
    await admin.from("orders").update({ status: "submitted" }).eq("id", orderId);
    const scopedA = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryA });
    const wrongTeam = await scopedA.rpc("list_team_members", { p_brewery: breweryB });
    const wrongToday = await scopedA.rpc("get_today_items", { p_brewery: breweryB, p_now: "2099-01-01T00:00:00Z" });

    const scopedB = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryB });
    const ownTeam = await scopedB.rpc("list_team_members", { p_brewery: breweryB });
    const ownToday = await scopedB.rpc("get_today_items", { p_brewery: breweryB, p_now: "2099-01-01T00:00:00Z" });
    await admin.from("orders").update({ status: "draft" }).eq("id", orderId);
    expect(wrongTeam.data).toEqual([]);
    expect(wrongToday.data).toEqual([]);
    expect(ownTeam.data?.length).toBeGreaterThan(0);
    expect((ownToday.data as { subject_id: string }[] | null)?.some(row => row.subject_id === orderId)).toBe(true);

    const customerScoped = await db({
      "x-mgr-actor-id": actor.id,
      "x-mgr-brewery-id": breweryB,
      "x-mgr-customer-id": customerB,
    });
    expect((await customerScoped.rpc("get_loss_review", { p_brewery: breweryB, p_start: "2026-01-01", p_end: "2026-12-31" })).error?.code).toBe("42501");
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

  it("fails closed for malformed, empty, or null-shaped customer scope on a staff write", async () => {
    for (const customerHeader of ["not-a-uuid", "", "null"]) {
      const requestId = crypto.randomUUID();
      const scoped = await db({
        "x-mgr-actor-id": actor.id,
        "x-mgr-brewery-id": breweryB,
        "x-mgr-customer-id": customerHeader,
      });
      expect((await scoped.rpc("update_brewery", {
        p_brewery: breweryB, p_name: "Must stay unchanged", p_timezone: "UTC", p_ttb_registry_no: null,
        p_pa_license_no: null, p_customer_phone: null,
        p_reading_due_hours: 24, p_request_id: requestId,
      })).error?.code).toBe("42501");
      expect((await admin.from("breweries").select("name").eq("id", breweryB).single()).data?.name).not.toBe("Must stay unchanged");
      expect(sql(`select count(*) from private.command_requests where actor_id='${actor.id}' and request_id='${requestId}'`)).toEqual(["0"]);
    }

    const valid = await db({ "x-mgr-actor-id": actor.id, "x-mgr-brewery-id": breweryB, "x-mgr-customer-id": customerA });
    expect((await valid.rpc("update_brewery", {
      p_brewery: breweryB, p_name: "Valid scoped write", p_timezone: "UTC", p_ttb_registry_no: null,
      p_pa_license_no: null, p_customer_phone: null, p_reading_due_hours: 24, p_request_id: crypto.randomUUID(),
    })).error).toBeNull();
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
