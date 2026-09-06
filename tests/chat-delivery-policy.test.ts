// tests/chat-delivery-policy.test.ts — delivery policy: brewery/personal quiet
// hours (incl. DST), 08:00/12:00 digest windows with missed-window recovery,
// and bounded leasing with lease-token outcomes and crash recovery (live DB).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, inst: { id: string }, channel: { id: string };
let customerId: string, shipToId: string, whId: string, skuId: string;

async function ins<T = { id: string }>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}
async function linkWithDm(ctx: Ctx) {
  await ins("chat_user_links", { brewery_id: b.id, installation_id: inst.id, provider: "slack", external_user_id: `U-${ctx.userId.slice(0, 8)}`, user_id: ctx.userId, state: "active", linked_at: new Date().toISOString() });
  return ins("notification_destinations", { brewery_id: b.id, installation_id: inst.id, kind: "personal", external_destination_id: `D-${ctx.userId.slice(0, 8)}`, user_id: ctx.userId, privacy_class: "direct" });
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
const scan = async (now: string) => {
  const { data, error } = await admin.rpc("scan_chat_notification_occurrences", { p_brewery: b.id, p_now: now });
  if (error) throw error;
  return data as { upserted: number; resolved: number; deliveries: number; digests: number };
};
const release = async (now: string, start: string | null, end: string | null, tz = "America/New_York") =>
  (await admin.rpc("chat_quiet_release", { p_now: now, p_start: start, p_end: end, p_tz: tz })).data as string;
const iso = (v: string) => new Date(v).toISOString();
// Leasing clock sits a decade ahead: submittedOrder() queues deliveries at the
// real now(), and lease_chat_deliveries only returns rows due at or before p_now.
const lease = async (limit = 10, seconds = 60, now = "2036-09-05T14:00:00Z") => {
  const { data, error } = await admin.rpc("lease_chat_deliveries", { p_limit: limit, p_lease_seconds: seconds, p_now: now });
  if (error) throw error;
  return data as { id: string; occurrence_id: string; destination_id: string; installation_id: string; provider: string; lease_expires_at: string; attempt_count: number }[];
};

beforeAll(async () => {
  b = await makeBrewery();
  [adminCtx, sales] = await Promise.all([makeStaffCtx(b.id, "admin"), makeStaffCtx(b.id, "sales")]);
  inst = await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: `T-${b.id.slice(0, 8)}`, display_label: "Demo", state: "active", installer_user_id: adminCtx.userId, token_store_key: `slack:installation:T-${b.id.slice(0, 8)}` });
  await Promise.all([linkWithDm(adminCtx), linkWithDm(sales)]);
  whId = (await ins("locations", { brewery_id: b.id, name: "WH", kind: "warehouse" })).id;
  const product = await ins("products", { brewery_id: b.id, name: "IPA" });
  skuId = (await ins("skus", { brewery_id: b.id, product_id: product.id, name: "IPA 1/2bbl", package_type: "keg", bbl_per_unit: 0.5 })).id;
  const pl = await ins("price_lists", { brewery_id: b.id, name: "std" });
  await ins("price_list_items", { brewery_id: b.id, price_list_id: pl.id, sku_id: skuId, unit_price_cents: 12000 });
  customerId = (await ins("customers", { brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", price_list_id: pl.id })).id;
  shipToId = (await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" })).id;
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

describe("quiet hours", () => {
  it("releases immediately outside the window and at the window end inside it, including across midnight and DST", async () => {
    expect(iso(await release("2026-09-05T14:00:00Z", "21:00", "06:00"))).toBe("2026-09-05T14:00:00.000Z"); // 10:00 local
    expect(iso(await release("2026-09-05T02:00:00Z", "21:00", "06:00"))).toBe("2026-09-05T10:00:00.000Z"); // 22:00 local → 06:00
    expect(iso(await release("2026-09-05T08:30:00Z", "21:00", "06:00"))).toBe("2026-09-05T10:00:00.000Z"); // 04:30 local → 06:00
    expect(iso(await release("2026-09-05T14:00:00Z", null, null))).toBe("2026-09-05T14:00:00.000Z");
    // Fall-back night 2026-11-01: 01:30 EDT (05:30Z) is inside 01:00–03:00; release is 03:00 EST = 08:00Z.
    expect(iso(await release("2026-11-01T05:30:00Z", "01:00", "03:00"))).toBe("2026-11-01T08:00:00.000Z");
    // Spring-forward 2026-03-08: 01:30 EST (06:30Z) inside 01:00–03:00; 03:00 EDT = 07:00Z.
    expect(iso(await release("2026-03-08T06:30:00Z", "01:00", "03:00"))).toBe("2026-03-08T07:00:00.000Z");
  });

  it("delays every first-release DM by brewery quiet hours, and lets a linked user override their own", async () => {
    await expect(runCommand("set_brewery_quiet_hours", { installationId: inst.id, start: "21:00", end: "06:00" }, sales)).rejects.toThrow(/permission/i);
    await runCommand("set_brewery_quiet_hours", { installationId: inst.id, start: "21:00", end: "06:00" }, adminCtx);
    await runCommand("set_notification_preference", { reason: "submitted_order", enabled: true, quietHours: { start: "20:00", end: "09:00" } }, sales);

    const id = await submittedOrder();
    const occ = (await admin.from("notification_occurrences").select("id").eq("subject_id", id).single()).data!;
    // submit_order fanned out at wall-clock time; drop those rows so the scan's timing is what we observe
    await admin.from("notification_deliveries").delete().eq("occurrence_id", occ.id);
    await scan("2026-09-05T02:00:00Z"); // 22:00 local on 9/4
    const rows = (await admin.from("notification_deliveries").select("destination_id, next_attempt_at").eq("occurrence_id", occ.id)).data!;
    const byUser = Object.fromEntries(await Promise.all(rows.map(async (d) => [
      (await admin.from("notification_destinations").select("user_id").eq("id", d.destination_id).single()).data!.user_id, iso(d.next_attempt_at),
    ])));
    expect(byUser[adminCtx.userId]).toBe("2026-09-05T10:00:00.000Z"); // brewery window ends 06:00 local
    expect(byUser[sales.userId]).toBe("2026-09-05T13:00:00.000Z"); // personal window ends 09:00 local
    await runCommand("set_brewery_quiet_hours", { installationId: inst.id, start: null, end: null }, adminCtx);
    await runCommand("set_notification_preference", { reason: "submitted_order", enabled: true, quietHours: null }, sales);
  });
});

describe("operations digest windows", () => {
  it("creates one morning and one midday occurrence per brewery-local day, recovering missed windows, for the private channel only", async () => {
    await expect(runCommand("set_notification_destination", { installationId: inst.id, externalDestinationId: "C-ops" }, sales)).rejects.toThrow(/permission/i);
    channel = await runCommand("set_notification_destination", { installationId: inst.id, externalDestinationId: "C-ops" }, adminCtx) as { id: string };
    const digests = async () => (await admin.from("notification_occurrences").select("semantic_key, due_at, state").eq("brewery_id", b.id).eq("reason", "operations_digest").order("semantic_key")).data!;

    expect((await scan("2026-09-05T11:00:00Z")).digests).toBe(0); // 07:00 local: nothing yet
    expect((await scan("2026-09-05T12:30:00Z")).digests).toBe(1); // 08:30 local: morning
    expect((await scan("2026-09-05T12:45:00Z")).digests).toBe(0); // same window: updated, not appended
    expect((await scan("2026-09-05T17:00:00Z")).digests).toBe(1); // 13:00 local: midday
    expect((await digests()).map((d) => [d.semantic_key, iso(d.due_at)])).toEqual([
      [`operations_digest:${channel.id}:2026-09-05:midday`, "2026-09-05T16:00:00.000Z"],
      [`operations_digest:${channel.id}:2026-09-05:morning`, "2026-09-05T12:00:00.000Z"],
    ]);
    expect((await scan("2026-09-06T18:00:00Z")).digests).toBe(2); // first scan of the next day recovers both windows
    const rows = await digests();
    expect(rows.filter((d) => d.semantic_key.includes("2026-09-05")).every((d) => d.state === "resolved")).toBe(true);
    const delivery = (await admin.from("notification_deliveries").select("destination_id, next_attempt_at").eq("semantic_key", `operations_digest:${channel.id}:2026-09-06:morning:${channel.id}`).single()).data!;
    expect(delivery.destination_id).toBe(channel.id);
    expect(iso(delivery.next_attempt_at)).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("delivery leasing", () => {
  it("leases with skip locked, caps the batch, requires the lease token for outcomes, and recovers expired leases", async () => {
    // The lease is one global worker queue, so drain everything due (other suites' rows included) first.
    await admin.from("notification_deliveries").update({ state: "terminal" }).in("state", ["queued", "retrying", "leased"]);
    const id = await submittedOrder();
    const occ = (await admin.from("notification_occurrences").select("id").eq("subject_id", id).single()).data!;
    const queued = (await admin.from("notification_deliveries").select("id").eq("occurrence_id", occ.id)).data!;
    expect(queued.length).toBe(2);

    const [a, c] = await Promise.all([lease(1), lease(1)]);
    expect(a.length + c.length).toBe(2);
    expect(a[0].id).not.toBe(c[0].id);
    expect(Object.keys(a[0]).sort()).toEqual(["attempt_count", "destination_id", "id", "installation_id", "lease_expires_at", "occurrence_id", "provider"]);
    expect(a[0].attempt_count).toBe(1);
    expect(await lease(1)).toEqual([]);

    const wrong = await admin.rpc("complete_chat_delivery", { p_delivery: a[0].id, p_lease: "2000-01-01T00:00:00Z", p_conversation_id: "D1", p_message_id: "m1" });
    expect(wrong.error?.message).toMatch(/lease/i);
    const ok = await admin.rpc("complete_chat_delivery", { p_delivery: a[0].id, p_lease: a[0].lease_expires_at, p_conversation_id: "D1", p_message_id: "m1" });
    expect(ok.error).toBeNull();
    const sent = (await admin.from("notification_deliveries").select().eq("id", a[0].id).single()).data!;
    expect(sent).toMatchObject({ state: "sent", provider_conversation_id: "D1", provider_message_id: "m1", lease_expires_at: null });
    expect(sent.sent_at).not.toBeNull();

    const retry = await admin.rpc("retry_chat_delivery", { p_delivery: c[0].id, p_lease: c[0].lease_expires_at, p_next_attempt_at: "2036-09-05T14:05:00Z", p_error_code: "rate_limited" });
    expect(retry.error).toBeNull();
    expect((await admin.from("notification_deliveries").select().eq("id", c[0].id).single()).data).toMatchObject({ state: "retrying", last_error_code: "rate_limited", lease_expires_at: null });
    expect(await lease(10, 60, "2036-09-05T14:04:00Z")).toEqual([]);
    const [again] = await lease(10, 60, "2036-09-05T14:06:00Z");
    expect(again.id).toBe(c[0].id);
    expect(again.attempt_count).toBe(2);

    // Crash: the lease expires and the next call recovers the row.
    const [recovered] = await lease(10, 60, "2036-09-05T14:10:00Z");
    expect(recovered.id).toBe(c[0].id);
    expect(recovered.attempt_count).toBe(3);
    const stop = await admin.rpc("suppress_chat_delivery", { p_delivery: recovered.id, p_lease: recovered.lease_expires_at, p_state: "terminal", p_error_code: "invalid_auth" });
    expect(stop.error).toBeNull();
    expect((await admin.from("notification_deliveries").select("state, last_error_code").eq("id", recovered.id).single()).data).toEqual({ state: "terminal", last_error_code: "invalid_auth" });

    const denied = await adminCtx.db.rpc("lease_chat_deliveries", { p_limit: 1, p_lease_seconds: 60, p_now: "2036-09-05T14:00:00Z" });
    expect(denied.error?.message).toMatch(/permission denied|not find the function/i);
  });
});
