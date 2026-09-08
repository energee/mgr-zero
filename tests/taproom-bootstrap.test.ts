import { beforeAll, expect, it, vi } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { createRequestAuthContext } from "@/lib/auth/request-context";
import { runCommand, type StaffRole } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { issueChatLinkProof } from "@/lib/chat/linking";
import { ctxForBearer } from "@/lib/commands/context";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
beforeAll(async () => {
  const brewery = await makeBrewery();
  ctx = await makeStaffCtx(brewery.id, "taproom" as StaffRole);
});
it("bootstraps own taproom membership without private brewery columns", async () => {
  const auth = createRequestAuthContext(async () => ctx.db);
  expect(await auth.getStaffMembership(ctx.breweryId)).toMatchObject({ role: "taproom", breweryId: ctx.breweryId });
  expect((await ctx.db.from("breweries").select().eq("id", ctx.breweryId)).data).toEqual([]);
  const projection = await ctx.db.from("staff_brewery").select().eq("id", ctx.breweryId).single();
  expect(projection.error).toBeNull();
  expect(Object.keys(projection.data!).sort()).toEqual(["gravity_unit", "id", "name", "timezone"]);
  expect(await runCommand("get_gravity_unit", {}, ctx)).toMatchObject({ effective: "plato" });
  expect(await runCommand("get_notification_preferences", {}, ctx)).toHaveProperty("timezone");
});
it("allows own gravity and reason preferences with replay, never quiet-hour writes", async () => {
  const requestId = crypto.randomUUID();
  const execution = { requestId, correlationId: requestId };
  const first = await runCommand("set_my_gravity_unit", { unit: "sg" }, ctx, execution);
  expect(await runCommand("set_my_gravity_unit", { unit: "sg" }, ctx, execution)).toEqual(first);
  expect(await runCommand("get_gravity_unit", {}, ctx)).toMatchObject({ effective: "sg" });
  await runCommand("set_notification_preference", { reason: "operations_digest", enabled: false }, ctx);
  expect((await admin.from("notification_preferences").select("enabled").eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId).eq("reason", "operations_digest").single()).data?.enabled).toBe(false);
  await expect(runCommand("set_personal_quiet_hours", { start: "22:00", end: "08:00" }, ctx)).rejects.toMatchObject({ status: 403 });
  await expect(runCommand("set_notification_preference", { reason: "operations_digest", enabled: true, quietHours: { start: "22:00", end: "08:00" } }, ctx)).rejects.toMatchObject({ status: 403 });
  const forbidden = await ctx.db.rpc("set_personal_quiet_hours", { p_brewery: ctx.breweryId, p_start: "22:00", p_end: "08:00", p_timezone: "UTC", p_request_id: crypto.randomUUID() });
  expect(forbidden.error?.code).toBe("42501");
});

it("selects only verified active own personal destinations and keeps other preference values", async () => {
  const installation = (await ins("chat_installations", { brewery_id: ctx.breweryId, provider: "slack", external_installation_id: crypto.randomUUID(), display_label: "Local fixture", state: "active", installer_user_id: ctx.userId, token_store_key: crypto.randomUUID() })).id;
  await ins("chat_user_links", { brewery_id: ctx.breweryId, installation_id: installation, provider: "slack", external_user_id: "U-SELF", user_id: ctx.userId, state: "active" });
  const destination = (await ins("notification_destinations", { brewery_id: ctx.breweryId, installation_id: installation, kind: "personal", external_destination_id: "D-SELF", user_id: ctx.userId, privacy_class: "direct", validated_at: new Date().toISOString() })).id;
  const shared = (await ins("notification_destinations", { brewery_id: ctx.breweryId, installation_id: installation, kind: "private_channel", external_destination_id: "C-SHARED", privacy_class: "private_internal", validated_at: new Date().toISOString() })).id;
  const requestId = crypto.randomUUID();
  const input = { reason: "operations_digest", personalDestinationId: destination };
  const first = await runCommand("set_notification_destination", input, ctx, { requestId, correlationId: requestId });
  expect(await runCommand("set_notification_destination", input, ctx, { requestId, correlationId: requestId })).toEqual(first);
  await expect(runCommand("set_notification_destination", { ...input, reason: "submitted_order" }, ctx, { requestId, correlationId: requestId })).rejects.toMatchObject({ status: 409, code: "conflict" });
  expect(sql(`select command_name || ':' || (payload_hash = extensions.digest(jsonb_build_object('reason','operations_digest','personal_destination','${destination}'::uuid)::text,'sha256'))::text
    from private.command_requests where actor_id='${ctx.userId}' and request_id='${requestId}'`)).toEqual(["set_notification_destination:true"]);
  const pref = await admin.from("notification_preferences").select("enabled,personal_destination_id").eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId).eq("reason", "operations_digest").single();
  expect(pref.data).toEqual({ enabled: false, personal_destination_id: destination });
  await expect(runCommand("set_notification_destination", { ...input, personalDestinationId: shared }, ctx)).rejects.toMatchObject({ status: 403 });
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    await expect(runCommand("set_notification_destination", { installationId: installation, externalDestinationId: "C-SHARED" }, ctx)).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
  const other = await makeStaffCtx(ctx.breweryId, "taproom");
  await ins("chat_user_links", { brewery_id: ctx.breweryId, installation_id: installation, provider: "slack", external_user_id: "U-OTHER", user_id: other.userId, state: "active" });
  const otherDestination = (await ins("notification_destinations", { brewery_id: ctx.breweryId, installation_id: installation, kind: "personal", external_destination_id: "D-OTHER", user_id: other.userId, privacy_class: "direct", validated_at: new Date().toISOString() })).id;
  await expect(runCommand("set_notification_destination", { ...input, personalDestinationId: otherDestination }, ctx)).rejects.toMatchObject({ status: 403 });
  const foreign = await makeBrewery();
  for (const [name, args] of [
    ["set_my_gravity_unit", { p_brewery: foreign.id, p_unit: "sg", p_request_id: crypto.randomUUID() }],
    ["set_notification_preference", { p_brewery: foreign.id, p_reason: "operations_digest", p_enabled: false, p_quiet_start: null, p_quiet_end: null, p_quiet_tz: null, p_set_quiet: false, p_request_id: crypto.randomUUID() }],
    ["set_personal_notification_destination", { p_brewery: foreign.id, p_reason: "operations_digest", p_personal_destination: destination, p_request_id: crypto.randomUUID() }],
  ] as const) expect((await ctx.db.rpc(name, args)).error?.code, name).toBe("42501");
  await admin.from("notification_destinations").update({ validated_at: null }).eq("id", destination);
  await expect(runCommand("set_notification_destination", input, ctx)).rejects.toMatchObject({ status: 403 });
  await admin.from("notification_destinations").update({ validated_at: new Date().toISOString() }).eq("id", destination);
  await admin.from("notification_destinations").update({ state: "blocked" }).eq("id", destination);
  await expect(runCommand("set_notification_destination", input, ctx)).rejects.toMatchObject({ status: 403 });
});

it("preserves cookie and bearer membership across own breweries and rejects a foreign selection", async () => {
  const own = await makeBrewery();
  const foreign = await makeBrewery();
  await ins("brewery_users", { brewery_id: own.id, user_id: ctx.userId, role: "taproom" });
  const request = createRequestAuthContext(async () => ctx.db);
  for (const breweryId of [ctx.breweryId, own.id]) {
    expect(await request.getStaffMembership(breweryId)).toMatchObject({ breweryId, role: "taproom" });
    expect(await ctxForBearer(ctx.db, ctx.userId, breweryId)).toMatchObject({ breweryId, role: "taproom" });
  }
  expect(await request.getStaffMembership(foreign.id)).toBeNull();
  await expect(ctxForBearer(ctx.db, ctx.userId, foreign.id)).rejects.toMatchObject({ status: 403 });
});
it("links and unlinks own Slack identity with replay and refuses other people's links", async () => {
  process.env.APP_URL ??= "https://mgr.test";
  const b = await makeBrewery();
  const staff = await makeStaffCtx(b.id, "taproom");
  const other = await makeStaffCtx(b.id, "taproom");
  const installation = (await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: crypto.randomUUID(), display_label: "Local fixture", state: "active", installer_user_id: staff.userId, token_store_key: crypto.randomUUID() })).id;
  const proof = await issueChatLinkProof(admin, installation, "U-LINK");
  const requestId = crypto.randomUUID(); const execution = { requestId, correlationId: requestId };
  const linked = await runCommand("consume_chat_link_proof", { proof: proof.proof }, staff, execution);
  expect(await runCommand("consume_chat_link_proof", { proof: proof.proof }, staff, execution)).toEqual(linked);
  expect((await staff.db.from("chat_user_links").select("id")).data).toEqual([{ id: proof.linkId }]);
  await expect(runCommand("unlink_chat_user", { linkId: proof.linkId }, other)).rejects.toMatchObject({ status: 403 });
  const unlinkId = crypto.randomUUID(); const unlinkExecution = { requestId: unlinkId, correlationId: unlinkId };
  expect(await runCommand("unlink_chat_user", { linkId: proof.linkId }, staff, unlinkExecution)).toEqual({ ok: true });
  expect(await runCommand("unlink_chat_user", { linkId: proof.linkId }, staff, unlinkExecution)).toEqual({ ok: true });
  expect((await admin.from("chat_user_links").select("state").eq("id", proof.linkId).single()).data?.state).toBe("unlinked");
});
it("honors a selected destination on new fanout while null keeps legacy routing", async () => {
  const b = await makeBrewery(); const staff = await makeStaffCtx(b.id, "sales");
  const installation = (await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: crypto.randomUUID(), display_label: "Fanout fixture", state: "active", installer_user_id: staff.userId, token_store_key: crypto.randomUUID() })).id;
  await ins("chat_user_links", { brewery_id: b.id, installation_id: installation, provider: "slack", external_user_id: "U-FANOUT", user_id: staff.userId, state: "active" });
  const destinations = [];
  for (const external of ["D-A", "D-B"]) destinations.push((await ins("notification_destinations", { brewery_id: b.id, installation_id: installation, kind: "personal", external_destination_id: external, user_id: staff.userId, privacy_class: "direct", validated_at: new Date().toISOString() })).id);
  const occurrence = async (key: string) => (await ins("notification_occurrences", { brewery_id: b.id, reason: "submitted_order", subject_type: "order", subject_id: crypto.randomUUID(), source_version: "1", occurred_at: new Date().toISOString(), owner_query: "orders", urgency: "normal", payload: { recipient_roles: ["sales"] }, semantic_key: key })).id;
  const first = await occurrence("default");
  sql(`select public.chat_fanout_deliveries('${b.id}',now(),'${first}')`);
  expect((await admin.from("notification_deliveries").select("destination_id").eq("occurrence_id", first)).data?.map(r => r.destination_id).sort()).toEqual([...destinations].sort());
  await runCommand("set_notification_destination", { reason: "submitted_order", personalDestinationId: destinations[0] }, staff);
  const second = await occurrence("selected");
  sql(`select public.chat_fanout_deliveries('${b.id}',now(),'${second}')`);
  expect((await admin.from("notification_deliveries").select("destination_id").eq("occurrence_id", second)).data).toEqual([{ destination_id: destinations[0] }]);
});
it("rejects quiet-hour changes through a verified Slack callback as well as the HTTP command", async () => {
  const b = await makeBrewery(); const staff = await makeStaffCtx(b.id, "sales");
  const installation = (await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: crypto.randomUUID(), display_label: "Callback fixture", state: "active", installer_user_id: staff.userId, token_store_key: crypto.randomUUID() })).id;
  await ins("chat_user_links", { brewery_id: b.id, installation_id: installation, provider: "slack", external_user_id: "U-CALLBACK", user_id: staff.userId, state: "active" });
  const intent = await admin.rpc("issue_chat_action_intent", { p_installation: installation, p_external_user_id: "U-CALLBACK", p_action: "mgr_save_preferences" });
  expect(intent.error).toBeNull();
  await admin.from("brewery_users").update({ role: "taproom" }).eq("brewery_id", b.id).eq("user_id", staff.userId);
  const hidden = await admin.rpc("issue_chat_action_intent", { p_installation: installation, p_external_user_id: "U-CALLBACK", p_action: "mgr_preferences" });
  expect(hidden.error).toBeNull(); expect(hidden.data).toBeNull();
  const receipt = await ins("chat_callback_receipts", { brewery_id: b.id, installation_id: installation, provider: "slack", callback_id: crypto.randomUUID(), callback_kind: "mgr_save_preferences", external_user_id: "U-CALLBACK", disposition: "pending", payload_hash: "fixture", received_at: new Date().toISOString() });
  const result = await admin.rpc("consume_chat_action_intent", { p_receipt: receipt.id, p_intent: intent.data, p_action: "mgr_save_preferences", p_input: { reason: "operations_digest", enabled: true, start: "22:00", end: "08:00", timezone: "UTC" } });
  expect(result.error).toBeNull();
  expect(result.data).toEqual({ disposition: "ignored", code: "invalid_action" });
  expect((await admin.from("notification_preferences").select("id").eq("brewery_id", b.id)).data).toEqual([]);
});

it("Beer reads only allowed taproom stock and never queries forbidden aggregates", async () => {
  const cat = await seedCatalog(ctx.breweryId);
  const taproom = await seedLocation(ctx.breweryId, { name: "Taproom", kind: "taproom" });
  const warehouse = await seedLocation(ctx.breweryId, { name: "Warehouse" });
  for (const location of [taproom, warehouse]) await ins("inventory_movements", { brewery_id: ctx.breweryId, sku_id: cat.skuId, location_id: location.id, bin_id: location.binId, qty: 7, type: "opening_balance", created_by: ctx.userId });
  const fetch = vi.spyOn(globalThis, "fetch");
  try {
    expect(await runCommand("get_beer_overview", {}, ctx)).toEqual({ taproomStock: [{ skuId: cat.skuId, locationId: taproom.id, sku: "IPA case", location: "Taproom", qty: 7 }] });
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname).sort()).toEqual(["/rest/v1/locations", "/rest/v1/on_hand", "/rest/v1/skus"]);
  } finally { fetch.mockRestore(); }
  await expect(runCommand("get_brewery", {}, ctx)).rejects.toMatchObject({ status: 403 });
  await expect(runCommand("list_work", {}, ctx)).rejects.toMatchObject({ status: 403 });
  await expect(runCommand("search_entities", { q: "IPA" }, ctx)).rejects.toMatchObject({ status: 403 });
});
it("keeps authenticated provisioning separate from the actor's tenant role", async () => {
  const b = await makeBrewery(); const staff = await makeStaffCtx(b.id, "taproom");
  const requestId = crypto.randomUUID();
  const input = { name: `Provision-${requestId}`, timezone: "America/New_York" };
  const pretenant = { db: staff.db, userId: staff.userId, breweryId: null, role: null };
  const result = await runCommand("provision_brewery", input, pretenant, { requestId, correlationId: requestId });
  expect(await runCommand("provision_brewery", input, pretenant, { requestId, correlationId: requestId })).toEqual(result);
  const memberships = await admin.from("brewery_users").select("brewery_id,role").eq("user_id", staff.userId);
  expect(memberships.data).toHaveLength(2);
  expect(memberships.data).toContainEqual({ brewery_id: b.id, role: "taproom" });
  expect(memberships.data?.filter(m => m.brewery_id !== b.id).map(m => m.role)).toEqual(["admin"]);
});

it("keeps direct table DML forbidden even on the role's readable tables", async () => {
  expect((await ctx.db.from("brands").insert({ brewery_id: ctx.breweryId, name: "Denied raw insert" })).error?.code).toBe("42501");
  expect((await ctx.db.from("notification_preferences").update({ enabled: true }).eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId)).error?.code).toBe("42501");
  expect((await ctx.db.from("inventory_movements").delete().eq("brewery_id", ctx.breweryId)).error?.code).toBe("42501");
});

it("rejects a real pending snooze callback after Sales becomes Taproom without changing delivery or due state", async () => {
  const b = await makeBrewery(); const staff = await makeStaffCtx(b.id, "sales");
  const installation = (await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: crypto.randomUUID(), display_label: "Snooze fixture", state: "active", installer_user_id: staff.userId, token_store_key: crypto.randomUUID() })).id;
  await ins("chat_user_links", { brewery_id: b.id, installation_id: installation, provider: "slack", external_user_id: "U-SNOOZE", user_id: staff.userId, state: "active" });
  const destination = await ins("notification_destinations", { brewery_id: b.id, installation_id: installation, kind: "personal", external_destination_id: "D-SNOOZE", user_id: staff.userId, privacy_class: "direct" });
  const customer = await seedCustomer(b.id); const location = await seedLocation(b.id);
  const order = await ins("orders", { brewery_id: b.id, kind: "wholesale", status: "submitted", customer_id: customer.customerId, ship_to_id: customer.shipToId, sale_channel_id: customer.saleChannelId, from_location_id: location.id, created_by: staff.userId });
  expect((await admin.rpc("record_submitted_order_occurrence", { p_order: order.id })).error).toBeNull();
  const occurrence = (await admin.from("notification_occurrences").select("id").eq("subject_id", order.id).single()).data!;
  const delivery = (await admin.from("notification_deliveries").select("id").eq("occurrence_id", occurrence.id).eq("destination_id", destination.id).single()).data!;
  const issue = async () => {
    const result = await admin.rpc("issue_chat_action_intent", { p_installation: installation, p_external_user_id: "U-SNOOZE", p_action: "mgr_snooze", p_delivery: delivery.id });
    expect(result.error).toBeNull(); expect(result.data).toMatch(/^[0-9a-f-]{36}$/);
    return result.data as string;
  };
  const consume = async (intent: string) => {
    const receipt = await ins("chat_callback_receipts", { brewery_id: b.id, installation_id: installation, provider: "slack", callback_id: crypto.randomUUID(), callback_kind: "mgr_snooze", external_user_id: "U-SNOOZE", disposition: "pending", payload_hash: "fixture", received_at: new Date().toISOString() });
    const result = await admin.rpc("consume_chat_action_intent", { p_receipt: receipt.id, p_intent: intent, p_action: "mgr_snooze", p_input: {} });
    expect(result.error).toBeNull(); return result.data;
  };
  // Positive control: this exact delivery has current work and really can snooze.
  expect(await consume(await issue())).toEqual({ disposition: "processed" });
  const stale = await issue();
  const before = (await admin.from("notification_deliveries").select().eq("id", delivery.id).single()).data;
  const dueBefore = await runCommand("get_today", {}, staff);
  expect((dueBefore as unknown[]).length).toBeGreaterThan(0);
  expect((await admin.from("brewery_users").update({ role: "taproom" }).eq("brewery_id", b.id).eq("user_id", staff.userId)).error).toBeNull();
  expect(await consume(stale)).toEqual({ disposition: "ignored", code: "invalid_action" });
  expect((await admin.from("notification_deliveries").select().eq("id", delivery.id).single()).data).toEqual(before);
  expect((await admin.from("notification_occurrences").select("state").eq("id", occurrence.id).single()).data).toEqual({ state: "active" });
  expect((await admin.from("notification_preferences").select().eq("brewery_id", b.id)).data).toEqual([]);
  expect((await admin.from("chat_action_intents").select("consumed_at").eq("id", stale).single()).data).toEqual({ consumed_at: null });
  expect((await admin.rpc("issue_chat_action_intent", { p_installation: installation, p_external_user_id: "U-SNOOZE", p_action: "mgr_snooze", p_delivery: delivery.id })).data).toBeNull();
});

it("loads complete Taproom stock and names SKUs beyond the catalog response cap", async () => {
  const brewery = await makeBrewery();
  const staff = await makeStaffCtx(brewery.id, "taproom");
  const cat = await seedCatalog(brewery.id);
  const location = await seedLocation(brewery.id, { kind: "taproom", name: "Big taproom" });
  const brands = Array.from({ length: 1001 }, (_, n) => ({ id: crypto.randomUUID(), brewery_id: brewery.id, name: `Brand ${n}` }));
  expect((await admin.from("brands").insert(brands)).error).toBeNull();
  const skus = Array.from({ length: 1001 }, (_, n) => ({ id: crypto.randomUUID(), brewery_id: brewery.id,
    brand_id: brands[n].id, format_id: cat.formatId, name: `Stocked SKU ${n}` }));
  expect((await admin.from("skus").insert(skus)).error).toBeNull();
  const firstPage = await staff.db.from("skus").select("id").eq("brewery_id", brewery.id);
  expect(firstPage.error).toBeNull();
  expect(firstPage.data).toHaveLength(1000);
  const outside = skus.find(s => !firstPage.data!.some(row => row.id === s.id))!;
  expect(outside).toBeDefined();
  const movement = (skuId: string) => ({ brewery_id: brewery.id, sku_id: skuId, location_id: location.id,
    bin_id: location.binId, qty: 7, type: "opening_balance", created_by: staff.userId });
  await ins("inventory_movements", movement(outside.id));
  expect.soft(await runCommand("get_beer_overview", {}, staff)).toEqual({ taproomStock: [
    { skuId: outside.id, locationId: location.id, sku: outside.name, location: location.name, qty: 7 },
  ] });
  expect((await admin.from("inventory_movements").insert(skus.filter(s => s.id !== outside.id).map(s => movement(s.id)))).error).toBeNull();
  const result = await runCommand("get_beer_overview", {}, staff) as { taproomStock: { skuId: string; sku: string; qty: number }[] };
  expect(result.taproomStock).toHaveLength(1001);
  expect(new Set(result.taproomStock.map(s => s.skuId)).size).toBe(1001);
  expect(result.taproomStock.every(s => s.sku === skus.find(row => row.id === s.skuId)?.name && s.qty === 7)).toBe(true);
});

it("separates authenticated personal selection from service-only OAuth and shared settings", () => {
  expect(sql(`select p.proname || ':' || r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace
      and p.proname in ('activate_chat_installation','find_chat_oauth_intent','set_notification_destination','set_personal_notification_destination')
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
    "activate_chat_installation:service_role", "find_chat_oauth_intent:service_role",
    "set_notification_destination:service_role", "set_personal_notification_destination:authenticated",
  ]);
});
