// tests/chat-occurrences.test.ts — durable notification occurrences: atomic
// submitted-order transition, catch-up scan idempotence, semantic keys,
// recipient fan-out (roles, mutes, links), and resolved suppression (live DB).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, channelId, insertFixture, makeBrewery, makeStaffCtx, priceSku } from "./helpers";
import { toNotification } from "@/lib/chat/jobs";
import { renderSlackMessage } from "@/lib/chat/slack-renderer";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, sales: Ctx, mutedSales: Ctx, warehouse: Ctx, unlinkedSales: Ctx;
let inst: { id: string };
let customerId: string, shipToId: string, whId: string, whBinId: string, skuId: string;

async function ins<T = { id: string }>(table: string, row: Record<string, unknown>): Promise<T> {
  if (table === "inventory_movements") return insertFixture<T>(table, row)[0];
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T;
}

async function linkWithDm(ctx: Ctx) {
  await ins("chat_user_links", { brewery_id: b.id, installation_id: inst.id, provider: "slack", external_user_id: `U-${ctx.userId.slice(0, 8)}`, user_id: ctx.userId, state: "active", linked_at: new Date().toISOString() });
  return ins("notification_destinations", { brewery_id: b.id, installation_id: inst.id, kind: "personal", external_destination_id: `D-${ctx.userId.slice(0, 8)}`, user_id: ctx.userId, privacy_class: "direct" });
}

async function createOrder(requested = "2026-09-05") {
  const { data, error } = await adminCtx.db.rpc("create_order", { p_request_id: crypto.randomUUID(),
    p_brewery: b.id, p_kind: "wholesale", p_customer: customerId, p_ship_to: shipToId,
    p_from_location: whId, p_to_location: null, p_requested: requested, p_po: null, p_note: null, p_lines: [{ sku_id: skuId, qty: 1 }],
  });
  if (error) throw error;
  return (data as { order_id: string }).order_id;
}

const scan = async (now = "2026-09-05T14:00:00Z") => {
  const { data, error } = await admin.rpc("scan_chat_notification_occurrences", { p_brewery: b.id, p_now: now });
  if (error) throw error;
  return data as { upserted: number; resolved: number; deliveries: number; digests: number };
};
const occurrences = async (subjectId: string) =>
  (await admin.from("notification_occurrences").select().eq("brewery_id", b.id).eq("subject_id", subjectId).order("created_at")).data!;
const deliveriesFor = async (occurrenceId: string) =>
  (await admin.from("notification_deliveries").select().eq("occurrence_id", occurrenceId).order("created_at")).data!;
const recipientsOf = (rows: { destination_id: string }[]) =>
  Promise.all(rows.map(async (d) => (await admin.from("notification_destinations").select("user_id").eq("id", d.destination_id).single()).data!.user_id as string));

beforeAll(async () => {
  b = await makeBrewery();
  [adminCtx, sales, mutedSales, warehouse, unlinkedSales] = await Promise.all([
    makeStaffCtx(b.id, "admin"), makeStaffCtx(b.id, "sales"), makeStaffCtx(b.id, "sales"), makeStaffCtx(b.id, "warehouse"), makeStaffCtx(b.id, "sales"),
  ]);
  inst = await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: `T-${b.id.slice(0, 8)}`, display_label: "Demo", state: "active", installer_user_id: adminCtx.userId, token_store_key: `slack:installation:T-${b.id.slice(0, 8)}` });
  await Promise.all([linkWithDm(adminCtx), linkWithDm(sales), linkWithDm(mutedSales), linkWithDm(warehouse)]);
  await runCommand("set_notification_preference", { reason: "submitted_order", enabled: false }, mutedSales);
  whId = (await ins("locations", { brewery_id: b.id, name: "WH", kind: "warehouse" })).id;
  whBinId = (await ins("bins", { brewery_id: b.id, location_id: whId, name: "Cold" })).id;
  const brand = await ins("brands", { brewery_id: b.id, name: "IPA" });
  const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
  skuId = (await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "IPA 1/2bbl" })).id;
  customerId = (await ins("customers", { brewery_id: b.id, name: "Bar", type: "retailer", state: "PA", sale_channel_id: await channelId(b.id, "Wholesale") })).id;
  await priceSku(b.id, { saleChannelId: await channelId(b.id, "Wholesale"), brandId: brand.id, formatId: format.id, cents: 12000 });
  shipToId = (await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" })).id;
  await ins("inventory_movements", { brewery_id: b.id, sku_id: skuId, location_id: whId, bin_id: whBinId, qty: 100, type: "opening_balance", created_by: adminCtx.userId });
});

describe("notification occurrences", () => {
  it("submit_order records the submitted_order occurrence in the same transaction and the scan cannot duplicate it", async () => {
    const id = await createOrder();
    expect(await occurrences(id)).toEqual([]);
    await adminCtx.db.rpc("submit_order", { p_request_id: crypto.randomUUID(), p_order: id });
    const [occ] = await occurrences(id);
    expect(occ).toMatchObject({ reason: "submitted_order", subject_type: "order", state: "active", owner_query: "orders", urgency: "attention" });
    expect(occ.semantic_key).toBe(`submitted_order:${id}:${occ.source_version}`);
    expect(occ.payload).toMatchObject({ href: `/orders/${id}`, recipient_roles: ["admin", "sales"] });
    expect(JSON.stringify(occ.payload)).not.toContain("Bar");
    expect((await deliveriesFor(occ.id)).length).toBe(2); // admin + sales, fanned out in the same transaction

    await scan();
    const second = await scan();
    expect((await occurrences(id)).length).toBe(1);
    expect(second.upserted).toBe(0);
    expect((await deliveriesFor(occ.id)).length).toBe(2);
  });

  it("fans out personal deliveries to linked, unmuted recipients whose role matches (admin always)", async () => {
    const id = await createOrder();
    await adminCtx.db.rpc("submit_order", { p_request_id: crypto.randomUUID(), p_order: id });
    await scan();
    const [occ] = await occurrences(id);
    const rows = await deliveriesFor(occ.id);
    const recipients = await recipientsOf(rows);
    expect(recipients.sort()).toEqual([adminCtx.userId, sales.userId].sort());
    expect(rows.every((d) => d.state === "queued" && d.installation_id === inst.id && d.semantic_key === `${occ.semantic_key}:${d.destination_id}`)).toBe(true);
    for (const excluded of [mutedSales.userId, warehouse.userId, unlinkedSales.userId]) expect(recipients).not.toContain(excluded);
  });

  it("transitions submitted → pick due on confirm and resolves the stale occurrence, suppressing its queued deliveries", async () => {
    const id = await createOrder("2026-09-05");
    await adminCtx.db.rpc("submit_order", { p_request_id: crypto.randomUUID(), p_order: id });
    await scan("2026-09-05T14:00:00Z");
    await adminCtx.db.rpc("confirm_order", { p_request_id: crypto.randomUUID(), p_order: id });
    const result = await scan("2026-09-05T15:00:00Z");
    const occs = await occurrences(id);
    expect(occs.map((o) => [o.reason, o.state])).toEqual([["submitted_order", "resolved"], ["pick_due", "active"]]);
    expect(occs[0].resolved_at).not.toBeNull();
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    expect((await deliveriesFor(occs[0].id)).every((d) => d.state === "suppressed" && d.resolved_at !== null)).toBe(true);
    expect((await recipientsOf(await deliveriesFor(occs[1].id))).sort()).toEqual([adminCtx.userId, warehouse.userId].sort());
  });

  it("re-queues sent deliveries once for a resolved update, keeping the message id", async () => {
    const id = await createOrder();
    await adminCtx.db.rpc("submit_order", { p_request_id: crypto.randomUUID(), p_order: id });
    const [occ] = await occurrences(id);
    const [delivery] = await deliveriesFor(occ.id);
    await admin.from("notification_deliveries").update({ state: "sent", sent_at: new Date().toISOString(), provider_message_id: "m1" }).eq("id", delivery.id);
    await adminCtx.db.rpc("cancel_order", { p_request_id: crypto.randomUUID(), p_order: id, p_reason: "test" });
    await scan();
    const after = (await admin.from("notification_deliveries").select().eq("id", delivery.id).single()).data!;
    expect(after.state).toBe("queued");
    expect(after.provider_message_id).toBe("m1");
    expect(after.resolved_at).not.toBeNull();
    await scan();
    expect((await admin.from("notification_deliveries").select("state").eq("id", delivery.id).single()).data?.state).toBe("queued"); // only once
    expect((await occurrences(id))[0].state).toBe("resolved");
  });

  it("stays inside one brewery and refuses non-service callers", async () => {
    const other = await makeBrewery();
    const { data } = await admin.rpc("scan_chat_notification_occurrences", { p_brewery: other.id, p_now: "2026-09-05T14:00:00Z" });
    expect(data).toMatchObject({ upserted: 0, deliveries: 0, digests: 0 });
    const { error } = await adminCtx.db.rpc("scan_chat_notification_occurrences", { p_brewery: b.id, p_now: "2026-09-05T14:00:00Z" });
    expect(error?.message).toMatch(/permission denied|not find the function/i);
  });
});

it("keeps buyer question text and customer names in MGR while projecting safe invoice identity to chat", async () => {
  const invoice = await ins("invoices", { brewery_id: b.id, kind: "invoice", customer_id: customerId, issued_on: "2026-09-05" });
  const question = await ins("invoice_questions", { brewery_id: b.id, invoice_id: invoice.id, customer_id: customerId, body: "Private buyer note with contact and price", created_by: sales.userId });
  const today = await adminCtx.db.rpc("get_today_items", { p_brewery: b.id, p_now: "2036-09-05T14:00:00Z" });
  expect(today.error).toBeNull();
  expect(JSON.stringify(today.data)).toContain("Private buyer note");
  await scan("2036-09-05T14:00:00Z");
  const [occ] = await occurrences(question.id);
  expect(occ).toMatchObject({ reason: "invoice_question", subject_type: "invoice", subject_id: question.id,
    payload: { safe_label: expect.stringMatching(/^INV-\d+$/), detail: "Buyer asked about this invoice", href: `/invoices/${invoice.id}` } });
  expect(JSON.stringify(occ.payload)).not.toMatch(/Private buyer|Bar/);
  const rendered = renderSlackMessage(toNotification(occ), { intentId: "fixture", mgrBaseUrl: "https://mgr.test" });
  expect(JSON.stringify(rendered)).not.toMatch(/Private buyer|Bar/);
  expect(JSON.stringify(rendered)).toContain(`/invoices/${invoice.id}`);
  const home = await admin.rpc("get_chat_home_items", { p_installation: inst.id, p_external_user_id: `U-${sales.userId.slice(0, 8)}` });
  expect(home.error).toBeNull();
  expect(home.data).toEqual(expect.arrayContaining([expect.objectContaining({ subject_id: question.id, payload: occ.payload })]));
});
