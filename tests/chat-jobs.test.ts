// tests/chat-jobs.test.ts — worker orchestration against the live DB with a
// fake provider transport: job bearer auth, callback receipt claim → App Home
// publish (link vs current items), delivery send/update/suppress, per-
// conversation serialization, Retry-After and jittered backoff, permanent
// failures (terminal + reauthorization flag), invalid shared channel, and
// cleanup limited to expired private state rows.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { DB, admin, channelId, makeBrewery, makeStaffCtx, priceSku } from "./helpers";
import type { ChatProviderTransport } from "@/lib/chat/provider";
import { SLACK_CAPABILITIES } from "@/lib/chat/slack-transport";
import { authorizeJob } from "@/lib/chat/job-auth";
import { cleanupChatState, runChatCallbackBatch, runChatDeliveryBatch, runChatScan } from "@/lib/chat/jobs";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

process.env.APP_URL = "https://mgr.test";
process.env.CHAT_JOB_SECRET = "job-secret";

const adminUrl = DB;
const sql = new pg.Pool({ connectionString: adminUrl });

import * as slackAdapterModule from "@/lib/chat/slack-adapter";
import type { SlackClientLike } from "@/lib/chat/slack-transport";
// Stub only outgoing provider reads; destination proof and consumption use Postgres.
beforeAll(() => {
  process.env.APP_URL = "https://mgr.test";
  vi.spyOn(slackAdapterModule, "slackClientFor").mockReturnValue({
    conversationsInfo: async () => ({ is_private: true, is_archived: false, is_member: true, is_shared: false, is_ext_shared: false, is_pending_ext_shared: false }),
  postMessage: async () => { throw new Error("unexpected provider send"); }, updateMessage: async () => { throw new Error("unexpected provider update"); }, publishHome: async () => { throw new Error("unexpected provider publish"); },
  } as SlackClientLike);
});

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, inst: { id: string; external_installation_id: string };
let customerId: string, shipToId: string, whId: string, whBinId: string, skuId: string;

const calls = { sends: [] as { destinationId: string; at: number; notification: { subject: { safeLabel: string }; detail: string; actions: readonly { id: string; intentId?: string }[] } }[], updates: [] as { ref: { messageId: string }; resolved?: boolean }[], homes: [] as { externalUserId: string; items: readonly unknown[]; linkUrl?: string; intents?: Record<string,string> }[] };
let failNext: unknown = null;
let validation: { ok: true } | { ok: false; reason: string } = { ok: true };
const transport: ChatProviderTransport = {
  provider: "slack", capabilities: SLACK_CAPABILITIES,
  validateDestination: async () => validation,
  send: async (i) => { if (failNext) { const e = failNext; failNext = null; throw e; } calls.sends.push({ destinationId: i.destinationId, at: Date.now(), notification: i.notification }); return { conversationId: i.destinationId, messageId: `m${calls.sends.length}` }; },
  update: async (i) => { if (failNext) { const e = failNext; failNext = null; throw e; } calls.updates.push({ ref: i.ref, resolved: i.resolved }); },
  publishHome: async (i) => { calls.homes.push({ externalUserId: i.externalUserId, items: i.items, linkUrl: i.linkUrl, intents: i.intents }); },
};

async function ins<T = { id: string }>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}
async function linkWithDm(ctx: Ctx, externalUserId: string) {
  await ins("chat_user_links", { brewery_id: b.id, installation_id: inst.id, provider: "slack", external_user_id: externalUserId, user_id: ctx.userId, state: "active", linked_at: new Date().toISOString() });
  return ins("notification_destinations", { brewery_id: b.id, installation_id: inst.id, kind: "personal", external_destination_id: `D-${externalUserId}`, user_id: ctx.userId, privacy_class: "direct" });
}
async function submittedOrder() {
  const { data, error } = await adminCtx.db.rpc("create_order", { p_request_id: crypto.randomUUID(),
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: "2026-09-05", p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 1 }],
  });
  if (error) throw error;
  const id = (data as { order_id: string }).order_id;
  await adminCtx.db.rpc("submit_order", { p_request_id: crypto.randomUUID(), p_order: id });
  return id;
}
const deliveriesOf = async (orderId: string) => {
  const occ = (await admin.from("notification_occurrences").select("id").eq("subject_id", orderId).eq("reason", "submitted_order").single()).data!;
  return (await admin.from("notification_deliveries").select().eq("occurrence_id", occ.id).order("created_at").order("id")).data!;
};
// Frozen worker clock. Deliveries are queued with next_attempt_at = the real
// now(), so this must stay ahead of wall time or the lease finds nothing;
// pinned a decade out (it bit at 14:00Z on 2026-09-05, the old value).
const NOW = "2036-09-05T14:00:00Z";
const deliver = (limit = 50, now = NOW) => runChatDeliveryBatch({ limit, now: new Date(now), transport, db: admin });
const drain = () => admin.from("notification_deliveries").update({ state: "terminal" }).in("state", ["queued", "retrying", "leased"]);

beforeAll(async () => {
  b = await makeBrewery();
  [adminCtx, sales] = await Promise.all([makeStaffCtx(b.id, "admin"), makeStaffCtx(b.id, "sales")]);
  const teamId = `T-${b.id.slice(0, 8)}`;
  inst = await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: teamId, display_label: "Demo", state: "active", installer_user_id: adminCtx.userId, token_store_key: `slack:installation:${teamId}` });
  await Promise.all([linkWithDm(adminCtx, "U-admin"), linkWithDm(sales, "U-sales")]);
  whId = (await ins("locations", { brewery_id: b.id, name: "WH", kind: "warehouse" })).id;
  whBinId = (await ins("bins", { brewery_id: b.id, location_id: whId, name: "Cold" })).id;
  const brand = await ins("brands", { brewery_id: b.id, name: "IPA" });
  const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
  skuId = (await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "IPA 1/2bbl" })).id;
  customerId = (await ins("customers", { brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", sale_channel_id: await channelId(b.id, "Wholesale") })).id;
  await priceSku(b.id, { saleChannelId: await channelId(b.id, "Wholesale"), brandId: brand.id, formatId: format.id, cents: 12000 });
  shipToId = (await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" })).id;
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
  await drain();
});
afterAll(async () => { await sql.end(); });

describe("job authentication", () => {
  it("accepts only the exact bearer, in constant time, and never echoes it", () => {
    const req = (auth?: string) => new Request("https://mgr.test/api/chat/jobs/scan", { method: "POST", headers: auth ? { authorization: auth } : {} });
    expect(authorizeJob(req("Bearer job-secret"))).toBe(true);
    expect(authorizeJob(req("Bearer job-secre"))).toBe(false);
    expect(authorizeJob(req("Bearer job-secret-longer"))).toBe(false);
    expect(authorizeJob(req("Basic job-secret"))).toBe(false);
    expect(authorizeJob(req())).toBe(false);
  });
});

describe("callback batch (App Home)", () => {
  it("claims pending receipts once and publishes the link screen for unlinked users and current items for linked users", async () => {
    await submittedOrder();
    for (const user of ["U-sales", "U-stranger"]) {
      await admin.rpc("record_chat_callback_receipt", { p_provider: "slack", p_external_installation_id: inst.external_installation_id, p_callback_id: `Ev-${user}-${Date.now()}`, p_callback_kind: "app_home_opened", p_external_user_id: user, p_payload_hash: "0".repeat(64) });
    }
    const result = await runChatCallbackBatch({ limit: 10, now: new Date(NOW), transport, db: admin });
    expect(result.processed).toBeGreaterThanOrEqual(2); // the claim is global; other suites may leave receipts
    const linked = calls.homes.find((h) => h.externalUserId === "U-sales")!;
    expect(linked.linkUrl).toBeUndefined();
    expect(Object.keys(linked.intents!)).toEqual(["mgr_preferences", "mgr_refresh", "mgr_unlink"]);
    expect(Object.values(linked.intents!).every(id => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
    expect(linked.items.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(linked.items)).toMatch(/ORD-\d{4}/);
    const stranger = calls.homes.find((h) => h.externalUserId === "U-stranger")!;
    expect(stranger.linkUrl).toMatch(/^https:\/\/mgr\.test\/settings\/chat\/link\?proof=/);
    expect((await admin.from("chat_user_links").select("state").eq("installation_id", inst.id).eq("external_user_id", "U-stranger").single()).data?.state).toBe("pending");
    const receipts = (await admin.from("chat_callback_receipts").select("disposition").eq("installation_id", inst.id)).data!;
    expect(receipts.every((r) => r.disposition === "processed")).toBe(true);
    expect((await runChatCallbackBatch({ limit: 10, now: new Date(NOW), transport, db: admin })).processed).toBe(0);
  });
});

describe("delivery batch", () => {
  it("sends queued personal deliveries once, serialising a conversation to one send per second", async () => {
    await drain(); calls.sends.length = 0;
    const first = await submittedOrder();
    const second = await submittedOrder();
    const before = await deliveriesOf(first);
    expect(before.every((d) => d.state === "queued")).toBe(true);
    const result = await deliver();
    expect(calls.sends.every(s => s.notification.actions.some(a => a.id === "snooze" && /^[0-9a-f-]{36}$/.test(a.intentId!)))).toBe(true);
    expect(result.sent).toBe(4); // 2 orders × (admin + sales)
    for (const orderId of [first, second]) {
      for (const d of await deliveriesOf(orderId)) {
        expect(d.state).toBe("sent");
        expect(d.provider_message_id).toMatch(/^m\d+$/);
        expect(d.provider_conversation_id).toMatch(/^D-U-/);
      }
    }
    const perConversation = new Map<string, number[]>();
    for (const s of calls.sends) perConversation.set(s.destinationId, [...(perConversation.get(s.destinationId) ?? []), s.at]);
    for (const [, times] of perConversation) if (times.length > 1) expect(times[1] - times[0]).toBeGreaterThanOrEqual(1000);
    expect(calls.sends.every((s) => !JSON.stringify(s.notification).includes("Bar"))).toBe(true);
    expect((await deliver()).sent).toBe(0);
  });

  it("updates a sent message when its occurrence resolves and suppresses unsent ones", async () => {
    await drain(); calls.updates.length = 0;
    const id = await submittedOrder();
    await deliver();
    const [sent] = await deliveriesOf(id);
    await admin.from("notification_deliveries").update({ state: "queued", provider_message_id: null, provider_conversation_id: null, sent_at: null }).eq("id", (await deliveriesOf(id))[1].id); // simulate one never sent
    await adminCtx.db.rpc("cancel_order", { p_request_id: crypto.randomUUID(), p_order: id, p_reason: "test" });
    await runChatScan({ now: new Date(NOW), db: admin });
    const rows = await deliveriesOf(id);
    expect(rows.find((d) => d.id === sent.id)!.state).toBe("queued"); // queued for its resolved update
    expect(rows.find((d) => d.id !== sent.id)!.state).toBe("suppressed");
    const result = await deliver();
    expect(result.updated).toBe(1);
    expect(calls.updates.at(-1)).toEqual({ ref: { conversationId: sent.provider_conversation_id, messageId: sent.provider_message_id }, resolved: true });
    expect((await deliveriesOf(id)).find((d) => d.id === sent.id)!.state).toBe("updated");
  });

  it("rechecks source resolution before sending or updating without a scan", async () => {
    await drain();
    const id=await submittedOrder();
    const [sent,unsent]=await deliveriesOf(id);
    await admin.from("notification_deliveries").update({provider_message_id:"old-message",provider_conversation_id:"D-old"}).eq("id",sent.id);
    await adminCtx.db.rpc("cancel_order",{p_request_id:crypto.randomUUID(),p_order:id,p_reason:"resolved before scanner"});
    expect((await admin.from("notification_occurrences").select("state").eq("id",sent.occurrence_id).single()).data?.state).toBe("active");
    calls.sends.length=0;calls.updates.length=0;
    const result=await deliver();
    expect(result).toMatchObject({sent:0,updated:1,suppressed:1});
    expect(calls.sends).toHaveLength(0);
    expect(calls.updates).toEqual([{ref:{conversationId:"D-old",messageId:"old-message"},resolved:true}]);
    expect((await admin.from("notification_deliveries").select("state").eq("id",unsent.id).single()).data?.state).toBe("suppressed");
  });

  it("rechecks membership and role before personal send/update", async () => {
    for(const change of ["removed","role"]){
      await drain();const id=await submittedOrder();
      const rows=await deliveriesOf(id);
      const salesDestination=(await admin.from("notification_destinations").select("id").eq("installation_id",inst.id).eq("user_id",sales.userId).single()).data!.id;
      const target=rows.find(d=>d.destination_id===salesDestination)!;
      await admin.from("notification_deliveries").update({state:"terminal"}).eq("id",rows.find(d=>d.id!==target.id)!.id);
      if(change==="role") await admin.from("notification_deliveries").update({provider_message_id:"existing",provider_conversation_id:"D-existing"}).eq("id",target.id);
      if(change==="removed") await admin.from("brewery_users").delete().eq("brewery_id",b.id).eq("user_id",sales.userId);
      else await admin.from("brewery_users").update({role:"brewer"}).eq("brewery_id",b.id).eq("user_id",sales.userId);
      try{
        calls.sends.length=0;calls.updates.length=0;
        expect(await deliver()).toMatchObject({sent:0,updated:0,suppressed:1});
        expect(calls.sends).toHaveLength(0);expect(calls.updates).toHaveLength(0);
      } finally {
        if(change==="removed") await ins("brewery_users",{brewery_id:b.id,user_id:sales.userId,role:"sales"});
        else await admin.from("brewery_users").update({role:"sales"}).eq("brewery_id",b.id).eq("user_id",sales.userId);
      }
    }
  });

  it.each(["warehouse", "admin"] as const)("rejects the old %s driver after reassignment without rescanning", async (role) => {
    await drain();
    const driver=role === "admin" ? adminCtx : await makeStaffCtx(b.id,"warehouse");
    const replacement=await makeStaffCtx(b.id,"warehouse");
    const destination=role === "admin"
      ? (await admin.from("notification_destinations").select("id").eq("installation_id",inst.id).eq("user_id",driver.userId).single()).data!
      : await linkWithDm(driver,"U-driver");
    const order=await submittedOrder();
    const shipment=await ins("shipments",{brewery_id:b.id,order_id:order,created_by:adminCtx.userId});
    const route=await ins("routes",{brewery_id:b.id,name:"Reassign",delivery_date:"2026-09-05",driver_user_id:driver.userId,departed_at:"2026-09-05T12:00:00Z"});
    const stop=await ins("deliveries",{brewery_id:b.id,route_id:route.id,shipment_id:shipment.id,stop_no:1});
    await runChatScan({now:new Date(NOW),db:admin});
    const occurrence=(await admin.from("notification_occurrences").select("id").eq("subject_id",stop.id).eq("reason","delivery_next").single()).data!;
    const target=(await admin.from("notification_deliveries").select("id").eq("occurrence_id",occurrence.id).eq("destination_id",destination.id).single()).data!;
    await drain();await admin.from("notification_deliveries").update({state:"queued",provider_message_id:"driver-message",provider_conversation_id:"D-driver"}).eq("id",target.id);
    await admin.from("routes").update({driver_user_id:replacement.userId}).eq("id",route.id);
    calls.sends.length=0;calls.updates.length=0;
    expect(await deliver()).toMatchObject({sent:0,updated:0,suppressed:1});
    expect(calls.sends).toHaveLength(0);expect(calls.updates).toHaveLength(0);
  });

  it("honours Retry-After, backs off transient failures with bounded jitter, and terminates permanent failures with a reauthorization flag", async () => {
    await drain();
    const id = await submittedOrder();
    const [, other] = await deliveriesOf(id);
    await admin.from("notification_deliveries").update({ state: "terminal" }).eq("id", other.id); // isolate one delivery
    failNext = Object.assign(new Error("ratelimited"), { data: { error: "ratelimited" }, retryAfter: 7 });
    await deliver(1);
    let [d] = await deliveriesOf(id);
    expect(d.state).toBe("retrying");
    expect(d.last_error_code).toBe("ratelimited");
    expect(new Date(d.next_attempt_at).getTime() - new Date(NOW).getTime()).toBe(7000);

    failNext = Object.assign(new Error("boom"), { data: { error: "internal_error" } });
    await deliver(1, "2036-09-05T14:00:10Z");
    [d] = await deliveriesOf(id);
    expect(d.state).toBe("retrying");
    const delay = (new Date(d.next_attempt_at).getTime() - new Date("2036-09-05T14:00:10Z").getTime()) / 1000;
    expect(delay).toBeGreaterThanOrEqual(2 ** d.attempt_count);
    expect(delay).toBeLessThanOrEqual(2 ** d.attempt_count * 1.25);

    failNext = Object.assign(new Error("invalid_auth"), { data: { error: "invalid_auth" } });
    await deliver(1, "2036-09-06T00:00:00Z");
    [d] = await deliveriesOf(id);
    expect(d).toMatchObject({ state: "terminal", last_error_code: "invalid_auth" });
    expect((await admin.from("chat_installations").select("state, last_failure_code").eq("id", inst.id).single()).data).toEqual({ state: "needs_reauthorization", last_failure_code: "invalid_auth" });
    await admin.from("chat_installations").update({ state: "active", last_failure_code: null }).eq("id", inst.id);
  });

  it("blocks an invalid shared channel without fallback, and sends an aggregate digest to a valid one", async () => {
    await drain(); calls.sends.length = 0;
    const channel = await runCommand("set_notification_destination", { installationId: inst.id, externalDestinationId: "C-ops" }, adminCtx) as { id: string };
    await submittedOrder();
    await runChatScan({ now: new Date("2036-09-05T12:30:00Z"), db: admin });
    validation = { ok: false, reason: "not_private" };
    await deliver(50, "2036-09-05T12:30:00Z");
    const blocked = (await admin.from("notification_destinations").select("state, blocked_reason").eq("id", channel.id).single()).data;
    expect(blocked).toEqual({ state: "blocked", blocked_reason: "not_private" });
    const digestDelivery = (await admin.from("notification_deliveries").select("state, last_error_code").eq("destination_id", channel.id).single()).data;
    expect(digestDelivery).toEqual({ state: "terminal", last_error_code: "not_private" });
    expect(calls.sends.filter((s) => s.destinationId === "C-ops")).toEqual([]);

    validation = { ok: true };
    const channel2 = await runCommand("set_notification_destination", { installationId: inst.id, externalDestinationId: "C-ops-2" }, adminCtx) as { id: string };
    await runChatScan({ now: new Date("2036-09-06T12:30:00Z"), db: admin });
    await deliver(50, "2036-09-06T12:30:00Z");
    const sentDigest = calls.sends.find((s) => s.destinationId === "C-ops-2")!;
    expect(sentDigest.notification.subject.safeLabel).toMatch(/Morning operations/);
    expect(sentDigest.notification.detail).toMatch(/Submitted orders: \d+/);
    expect(sentDigest.notification.detail).not.toMatch(/ORD-|Bar/);
    expect((await admin.from("notification_deliveries").select("state").eq("destination_id", channel2.id).single()).data?.state).toBe("sent");
  });
});

describe("state cleanup", () => {
  it("deletes only expired private state rows and keeps subscriptions", async () => {
    // Local `postgres` is not a superuser: chat_sdk tables are owned by mgr_chat_sdk, so use a member role like production.
    const role = `mgr_chat_jobs_${process.pid}`;
    const password = crypto.randomUUID();
    await sql.query(`create role ${role} login password '${password}'`);
    await sql.query(`grant mgr_chat_sdk to ${role}`);
    const url = new URL(adminUrl); url.username = role; url.password = password;
    const restricted = new pg.Pool({ connectionString: url.toString() });
    try {
      const prefix = `mgr-jobs-${process.pid}-${randomBytes(3).toString("hex")}`;
      await restricted.query("insert into chat_sdk.chat_state_locks (key_prefix, thread_id, token, expires_at) values ($1, 'a', 't', now() - interval '1 minute'), ($1, 'b', 't', now() + interval '1 hour')", [prefix]);
      await restricted.query("insert into chat_sdk.chat_state_cache (key_prefix, cache_key, value, expires_at) values ($1, 'a', 'v', now() - interval '1 minute'), ($1, 'b', 'v', null)", [prefix]);
      await restricted.query("insert into chat_sdk.chat_state_subscriptions (key_prefix, thread_id) values ($1, 'keep')", [prefix]);
      const result = await cleanupChatState({ now: new Date(), pool: restricted });
      expect(result.deleted).toBeGreaterThanOrEqual(2);
      const locks = (await restricted.query("select thread_id from chat_sdk.chat_state_locks where key_prefix = $1", [prefix])).rows.map((r) => r.thread_id);
      const cache = (await restricted.query("select cache_key from chat_sdk.chat_state_cache where key_prefix = $1", [prefix])).rows.map((r) => r.cache_key);
      const subs = (await restricted.query("select thread_id from chat_sdk.chat_state_subscriptions where key_prefix = $1", [prefix])).rows.map((r) => r.thread_id);
      expect(locks).toEqual(["b"]);
      expect(cache).toEqual(["b"]);
      expect(subs).toEqual(["keep"]);
    } finally {
      await restricted.end();
      await sql.query(`revoke mgr_chat_sdk from ${role}`);
      await sql.query(`drop role if exists ${role}`);
    }
  });
});
