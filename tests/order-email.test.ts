import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";

import { rawDatabase } from "./raw-database";
import { runOrderEmailBatch } from "@/lib/email/jobs";
import * as transport from "@/lib/email/transport";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

let staff: Awaited<ReturnType<typeof makeStaffCtx>>;
let buyer: Awaited<ReturnType<typeof makeCustomerUser>>;
let customer: Awaited<ReturnType<typeof seedCustomer>>;
let skuId: string, locationId: string;
beforeAll(async () => {
  const brewery = await makeBrewery();
  staff = await makeStaffCtx(brewery.id, "sales");
  customer = await seedCustomer(brewery.id);
  buyer = await makeCustomerUser(customer.customerId);
  const catalog = await seedCatalog(brewery.id);
  skuId = catalog.skuId;
  locationId = (await seedLocation(brewery.id)).id;
  await priceSku(brewery.id, { ...catalog, saleChannelId: customer.saleChannelId, cents: 2400 });
});
async function submittedOrder() {
  const created = await staff.db.rpc("create_order", { p_brewery: staff.breweryId, p_kind: "wholesale", p_customer: customer.customerId, p_ship_to: customer.shipToId, p_from_location: locationId, p_to_location: null, p_requested: "2026-10-01", p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 2 }], p_request_id: crypto.randomUUID() });
  expect(created.error).toBeNull();
  const id = (created.data as { order_id: string }).order_id;
  expect((await staff.db.rpc("submit_order", { p_order: id, p_request_id: crypto.randomUUID() })).error).toBeNull();
  return id;
}

describe("buyer confirmation outbox", () => {
  it("atomically snapshots linked buyers once with committed confirmation", async () => {
    const id = await submittedOrder();
    const payload = { p_order: id, p_request_id: crypto.randomUUID() };
    expect((await staff.db.rpc("confirm_order", payload)).error).toBeNull();
    expect((await staff.db.rpc("confirm_order", payload)).error).toBeNull();
    const rows = sql(`select jsonb_build_object('recipient',recipient,'state',state,'payload',payload)::text from private.order_email_deliveries where order_id='${id}'`, true).map(row => JSON.parse(row));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient: buyer.email, state: "pending", payload: { to: buyer.email } });
    expect(rows[0].payload.text).toContain("IPA case");
    expect(rows[0].payload.text).toContain("2.00");
  });
});


async function confirmed() {
  const id = await submittedOrder();
  expect((await staff.db.rpc("confirm_order", { p_order: id, p_request_id: crypto.randomUUID() })).error).toBeNull();
  sql(`update private.order_email_deliveries set state='blocked' where brewery_id='${staff.breweryId}' and order_id<>'${id}';
    update private.order_email_deliveries set created_at='1970-01-01' where order_id='${id}'`);
  return { orderId: id, deliveryId: sql(`select id from private.order_email_deliveries where order_id='${id}'`, true)[0] };
}
type Lease = { id: string; lease_token: string; payload: { from: string; to: string; subject: string; text: string } };
async function lease(id: string, from = "MGR <orders@example.test>") {
  const result = await rawDatabase(admin).rpc("lease_order_emails", { p_from: from });
  expect(result.error).toBeNull();
  return (result.data as Lease[]).find(row => row.id === id);
}

it("rolls back the outbox with confirmation", async () => {
  const id = await submittedOrder();
  sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${staff.userId}';
    select public.confirm_order('${id}','${crypto.randomUUID()}'); rollback;`);
  expect(sql(`select count(*) from private.order_email_deliveries where order_id='${id}'`, true)).toEqual(["0"]);
  expect((await admin.from("orders").select("status").eq("id", id).single()).data?.status).toBe("submitted");
});

it("freezes sender and recipient across uncertain retries, then prevents duplicate completion", async () => {
  const { deliveryId } = await confirmed();
  const first = (await lease(deliveryId))!;
  expect(first.payload.to).toBe(buyer.email);
  expect((await rawDatabase(admin).rpc("finish_order_email", { p_delivery: deliveryId, p_lease: first.lease_token, p_provider_id: null, p_error: "provider_uncertain", p_retry: true })).data).toBe(true);
  sql(`update private.order_email_deliveries set next_attempt_at=now() where id='${deliveryId}'`);
  const replay = (await lease(deliveryId, "Changed <changed@example.test>"))!;
  expect(replay.payload).toEqual(first.payload);
  expect(replay.lease_token).not.toBe(first.lease_token);
  expect((await rawDatabase(admin).rpc("finish_order_email", { p_delivery: deliveryId, p_lease: first.lease_token, p_provider_id: "stale", p_error: null, p_retry: false })).data).toBe(false);
  const completion = { p_delivery: deliveryId, p_lease: replay.lease_token, p_provider_id: "provider-42", p_error: null, p_retry: false };
  expect((await rawDatabase(admin).rpc("finish_order_email", completion)).data).toBe(true);
  expect((await rawDatabase(admin).rpc("finish_order_email", completion)).data).toBe(false);
  expect(await lease(deliveryId)).toBeUndefined();
});

it("blocks uncertainty beyond the provider dedupe window", async () => {
  const { deliveryId } = await confirmed();
  await lease(deliveryId);
  sql(`update private.order_email_deliveries set first_attempt_at=now()-interval '24 hours', lease_expires_at=now()-interval '1 minute' where id='${deliveryId}'`);
  expect(await lease(deliveryId)).toBeUndefined();
  expect(sql(`select state||':'||last_error from private.order_email_deliveries where id='${deliveryId}'`, true)).toEqual(["blocked:retry_window_expired"]);
});

it("rechecks buyer access and never retargets a changed email", async () => {
  const { deliveryId } = await confirmed();
  await admin.from("customer_users").delete().eq("customer_id", customer.customerId).eq("user_id", buyer.id);
  expect(await lease(deliveryId)).toBeUndefined();
  expect(sql(`select state||':'||last_error from private.order_email_deliveries where id='${deliveryId}'`, true)).toEqual(["suppressed:recipient_changed"]);
  await admin.from("customer_users").insert({ customer_id: customer.customerId, user_id: buyer.id });
  const next = await confirmed();
  const changed = await admin.auth.admin.updateUserById(buyer.id, { email: `changed-${crypto.randomUUID()}@test.local` });
  expect(changed.error).toBeNull();
  expect(await lease(next.deliveryId)).toBeUndefined();
  expect((await admin.auth.admin.updateUserById(buyer.id, { email: buyer.email })).error).toBeNull();
});

it("keeps missing recipients visible and enforces service and tenant boundaries", async () => {
  await admin.from("customer_users").delete().eq("customer_id", customer.customerId).eq("user_id", buyer.id);
  const { orderId, deliveryId } = await confirmed();
  const own = await rawDatabase(staff.db).rpc("get_order_email_status", { p_brewery: staff.breweryId, p_order: orderId });
  expect(own.error).toBeNull();
  expect(own.data).toMatchObject([{ state: "blocked", last_error: "no_recipient" }]);
  expect(await lease(deliveryId)).toBeUndefined();
  const outsider = await makeStaffCtx((await makeBrewery()).id);
  expect((await rawDatabase(outsider.db).rpc("get_order_email_status", { p_brewery: staff.breweryId, p_order: orderId })).error).not.toBeNull();
  expect((await rawDatabase(staff.db).rpc("get_order_email_status", { p_brewery: outsider.breweryId, p_order: orderId })).error).not.toBeNull();
  const buyerDb = await asUser(buyer.email);
  expect((await rawDatabase(buyerDb).rpc("get_order_email_status", { p_brewery: staff.breweryId, p_order: orderId })).error).not.toBeNull();
  expect((await rawDatabase(staff.db).rpc("lease_order_emails", { p_from: "orders@example.test" })).error?.code).toBe("42501");
  expect((await rawDatabase(staff.db).rpc("finish_order_email", { p_delivery: deliveryId, p_lease: crypto.randomUUID(), p_provider_id: "fake", p_error: null, p_retry: false })).error?.code).toBe("42501");
});


it("recovers a provider-accepted lost response through the durable runner once", async () => {
  expect((await admin.from("customer_users").insert({ customer_id: customer.customerId, user_id: buyer.id })).error).toBeNull();
  const { deliveryId } = await confirmed();
  vi.stubEnv("RESEND_API_KEY", "mock-only");
  vi.stubEnv("ORDER_EMAIL_FROM", "MGR <orders@example.test>");
  const accepted = new Map<string, transport.OrderEmail>();
  const send = vi.spyOn(transport, "sendOrderEmail").mockImplementation(async (id, message) => {
    if (!accepted.has(id)) { accepted.set(id, message); throw new TypeError("accepted but response lost"); }
    expect(message).toEqual(accepted.get(id));
    return `provider-${id}`;
  });
  await runOrderEmailBatch();
  expect(sql(`select state from private.order_email_deliveries where id='${deliveryId}'`, true)).toEqual(["pending"]);
  sql(`update private.order_email_deliveries set next_attempt_at=now() where id='${deliveryId}'`);
  vi.stubEnv("ORDER_EMAIL_FROM", "Changed <changed@example.test>");
  await runOrderEmailBatch();
  expect(sql(`select state||':'||provider_id from private.order_email_deliveries where id='${deliveryId}'`, true)).toEqual([`accepted:provider-${deliveryId}`]);
  await runOrderEmailBatch();
  expect(send.mock.calls.filter(([id]) => id === deliveryId)).toHaveLength(2);
  expect(accepted.get(deliveryId)?.from).toBe("MGR <orders@example.test>");
});
