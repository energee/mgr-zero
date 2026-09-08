import { beforeAll, describe, expect, it, vi } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import * as slackAdapterModule from "@/lib/chat/slack-adapter";
import type { SlackClientLike } from "@/lib/chat/slack-transport";
import { issueChatLinkProof } from "@/lib/chat/linking";


let ctx: Awaited<ReturnType<typeof makeStaffCtx>>, installation: string, delivery: string, occurrence: string, orderId: string;
const externalUser = "U-ACTIONS";
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await admin.rpc(name, args); if (r.error) throw r.error; return r.data;
}
async function intent(action: string, deliveryId: string | null = null) {
  return rpc("issue_chat_action_intent", { p_installation: installation, p_external_user_id: externalUser, p_action: action, p_delivery: deliveryId });
}
async function receipt(token: string, action: string, user = externalUser, callback = crypto.randomUUID()) {
  return rpc("record_chat_callback_receipt", { p_provider: "slack", p_external_installation_id: installation,
    p_callback_id: callback, p_callback_kind: action, p_external_user_id: user, p_payload_hash: token });
}
beforeAll(async () => {
  const b = await makeBrewery(); ctx = await makeStaffCtx(b.id);
  installation = crypto.randomUUID();
  await ins("chat_installations", { id: installation, brewery_id: b.id, provider: "slack", external_installation_id: installation,
    display_label: "Test", state: "active", installer_user_id: ctx.userId, token_store_key: installation });
  await ins("chat_user_links", { brewery_id: b.id, installation_id: installation, provider: "slack", external_user_id: externalUser, user_id: ctx.userId, state: "active", linked_at: new Date().toISOString() });
  const destination = await ins("notification_destinations", { brewery_id: b.id, installation_id: installation, kind: "personal", external_destination_id: externalUser, user_id: ctx.userId, privacy_class: "direct" });
  const customer=await seedCustomer(b.id); const location=await seedLocation(b.id);
  orderId=(await ins("orders",{brewery_id:b.id,kind:"wholesale",status:"submitted",customer_id:customer.customerId,ship_to_id:customer.shipToId,
    sale_channel_id:customer.saleChannelId,from_location_id:location.id,created_by:ctx.userId})).id;
  await rpc("record_submitted_order_occurrence",{p_order:orderId});
  occurrence=(await admin.from("notification_occurrences").select("id").eq("subject_id",orderId).single()).data!.id;
  delivery=(await admin.from("notification_deliveries").select("id").eq("occurrence_id",occurrence).eq("destination_id",destination.id).single()).data!.id;

});
describe("chat integration state", () => {
  it("registers snooze and preserves request identity, due state, and monotonic extension", async () => {
    const requestId = crypto.randomUUID();
    const until = new Date(Date.now() + 3600000).toISOString();
    const input = { deliveryId: delivery, until };
    const dueBefore=await runCommand("get_today",{},ctx);
    const first = await runCommand("snooze_notification", input, ctx, { requestId, correlationId: requestId });
    expect(await runCommand("snooze_notification", input, ctx, { requestId, correlationId: requestId })).toEqual(first);
    await expect(runCommand("snooze_notification", { ...input, until: new Date(Date.now() + 7200000).toISOString() }, ctx, { requestId, correlationId: requestId })).rejects.toMatchObject({ code: "conflict" });
    await runCommand("snooze_notification", { ...input, until: new Date(Date.now() + 60000).toISOString() }, ctx);
    const d = (await admin.from("notification_deliveries").select().eq("id", delivery).single()).data!;
    expect(new Date(d.next_attempt_at).getTime()).toBe(new Date(until).getTime());
    expect((await admin.from("notification_occurrences").select("state").eq("id", occurrence).single()).data?.state).toBe("active");
    expect(await runCommand("get_today",{},ctx)).toEqual(dueBefore);
  });
  it("supports all reasons, quiet validation, preference replay and App Home independence", async () => {
    for (const reason of ["submitted_order","pick_due","restock_due","delivery_next","fermentation_reading_overdue","invoice_question","operations_digest"]) {
      expect(await runCommand("set_notification_preference", {reason,enabled:true}, ctx)).toEqual({ok:true});
    }
    const requestId = crypto.randomUUID();
    const input = { reason: "restock_due", enabled: false };
    expect(await runCommand("set_notification_preference", input, ctx, { requestId, correlationId: requestId })).toEqual({ ok: true });
    expect(await runCommand("set_notification_preference", input, ctx, { requestId, correlationId: requestId })).toEqual({ ok: true });
    await expect(runCommand("set_notification_preference", { ...input, enabled: true }, ctx, { requestId, correlationId: requestId })).rejects.toMatchObject({ code: "conflict" });
    await expect(runCommand("set_personal_quiet_hours", { start: "25:00", end: "08:00" }, ctx)).rejects.toThrow();
    await expect(runCommand("set_personal_quiet_hours", { start: "22:00", end: "08:00", timezone: "Imaginary/Zone" }, ctx)).rejects.toThrow();
    await runCommand("set_personal_quiet_hours", { start: "22:00", end: "08:00", timezone: "America/New_York" }, ctx);
    await runCommand("set_notification_preference", { reason: "submitted_order", enabled: false }, ctx);
    const home = await rpc("get_chat_home_items", { p_installation: installation, p_external_user_id: externalUser });
    expect(home.map((i: {id:string}) => i.id)).toContain(occurrence);
  });
  it("issues opaque ten-minute actor-bound one-time intents and replays the recorded result", async () => {
    const token = await intent("mgr_mute_reason", delivery);
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    const row = (await admin.from("chat_action_intents").select().eq("id", token).single()).data!;
    expect(new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()).toBe(600000);
    const r = await receipt(token, "mgr_mute_reason");
    const args = { p_receipt: r.receipt_id, p_intent: token, p_action: "mgr_mute_reason", p_input: {} };
    const first = await rpc("consume_chat_action_intent", args);
    expect(first.disposition).toBe("processed");
    expect(await rpc("consume_chat_action_intent", args)).toEqual(first);
    const second = await receipt(token, "mgr_mute_reason");
    expect((await rpc("consume_chat_action_intent", { ...args, p_receipt: second.receipt_id })).disposition).toBe("ignored");
  });
  it("rejects snooze after the source resolves before the scanner runs", async () => {
    const token=await intent("mgr_snooze",delivery);
    const before=(await admin.from("notification_deliveries").select("next_attempt_at").eq("id",delivery).single()).data!;
    await admin.from("orders").update({status:"cancelled"}).eq("id",orderId);
    expect((await admin.from("notification_occurrences").select("state").eq("id",occurrence).single()).data?.state).toBe("active");
    const r=await receipt(token,"mgr_snooze");
    expect((await rpc("consume_chat_action_intent",{p_receipt:r.receipt_id,p_intent:token,p_action:"mgr_snooze",p_input:{}})).disposition).toBe("ignored");
    await expect(runCommand("snooze_notification",{deliveryId:delivery,until:new Date(Date.now()+7200000).toISOString()},ctx)).rejects.toMatchObject({status:403});
    expect((await admin.from("notification_deliveries").select("next_attempt_at").eq("id",delivery).single()).data).toEqual(before);
  });
  it("cannot reuse a personal intent in another installation or brewery", async () => {
    const token = await intent("mgr_refresh");
    const b = await makeBrewery(); const other = await makeStaffCtx(b.id);
    const otherInstall = await ins("chat_installations", { brewery_id:b.id,provider:"slack",external_installation_id:b.id,display_label:"Other",state:"active",installer_user_id:other.userId,token_store_key:b.id });
    await ins("chat_user_links", {brewery_id:b.id,installation_id:otherInstall.id,provider:"slack",external_user_id:externalUser,user_id:other.userId,state:"active",linked_at:new Date().toISOString()});
    const r=await rpc("record_chat_callback_receipt",{p_provider:"slack",p_external_installation_id:b.id,p_callback_id:crypto.randomUUID(),p_callback_kind:"mgr_refresh",p_external_user_id:externalUser,p_payload_hash:token});
    expect((await rpc("consume_chat_action_intent",{p_receipt:r.receipt_id,p_intent:token,p_action:"mgr_refresh",p_input:{}})).disposition).toBe("ignored");
    expect((await admin.from("chat_action_intents").select("consumed_at").eq("id",token).single()).data?.consumed_at).toBeNull();
  });
  it("binds unlink to selected brewery and rejects request reuse after switching breweries", async () => {
    const b=await makeBrewery();
    await ins("brewery_users",{brewery_id:b.id,user_id:ctx.userId,role:"admin"});
    const installationB=await ins("chat_installations",{brewery_id:b.id,provider:"slack",external_installation_id:b.id,display_label:"B",state:"active",installer_user_id:ctx.userId,token_store_key:b.id});
    const link=await ins("chat_user_links",{brewery_id:b.id,installation_id:installationB.id,provider:"slack",external_user_id:"U-B",user_id:ctx.userId,state:"active",linked_at:new Date().toISOString()});
    const input={linkId:link.id};
    await expect(runCommand("unlink_chat_user",input,ctx)).rejects.toMatchObject({status:403});
    expect((await admin.from("chat_user_links").select("state").eq("id",link.id).single()).data?.state).toBe("active");
    const execution={requestId:crypto.randomUUID(),correlationId:crypto.randomUUID()};
    const ctxB={...ctx,breweryId:b.id};
    const result=await runCommand("unlink_chat_user",input,ctxB,execution);
    expect(await runCommand("unlink_chat_user",input,ctxB,execution)).toEqual(result);
    await expect(runCommand("unlink_chat_user",input,ctx,execution)).rejects.toMatchObject({status:409,code:"conflict"});
  });
  it("rejects foreign users, expired intents, removed membership and ordinary callers", async () => {
    const token = await intent("mgr_refresh");
    const wrong = await receipt(token, "mgr_refresh", "U-OTHER");
    expect((await rpc("consume_chat_action_intent", { p_receipt: wrong.receipt_id, p_intent: token, p_action: "mgr_refresh", p_input: {} })).disposition).toBe("ignored");
    expect((await ctx.db.rpc("issue_chat_action_intent", { p_installation: installation, p_external_user_id: externalUser, p_action: "mgr_refresh", p_delivery: null })).error).not.toBeNull();
    await admin.from("chat_action_intents").update({ expires_at: new Date(0).toISOString() }).eq("id", token);
    const expired = await receipt(token, "mgr_refresh");
    expect((await rpc("consume_chat_action_intent", { p_receipt: expired.receipt_id, p_intent: token, p_action: "mgr_refresh", p_input: {} })).disposition).toBe("ignored");
    const removedToken = await intent("mgr_refresh");
    await admin.from("brewery_users").delete().eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId);
    const removed = await receipt(removedToken, "mgr_refresh");
    expect((await rpc("consume_chat_action_intent", { p_receipt: removed.receipt_id, p_intent: removedToken, p_action: "mgr_refresh", p_input: {} })).disposition).toBe("ignored");
    await ins("brewery_users", { brewery_id: ctx.breweryId, user_id: ctx.userId, role: "admin" });
  });
});

describe("live Chat settings", () => {
  it("reads bounded admin health and defaults, while staff access only their own preferences", async () => {
    const health = await runCommand("get_chat_integration_health", {}, ctx) as { installation: { id: string }; queue: Record<string, number> };
    expect(health.installation.id).toBe(installation);
    expect(JSON.stringify(health)).not.toMatch(/token_store_key|oauth_intent_hash|proof_hash/);
    expect(health.queue).toHaveProperty("retrying");
    expect(await runCommand("get_brewery_operating_defaults", {}, ctx)).toMatchObject({ fermentation_reading_due_hours: 24 });
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    await expect(runCommand("get_chat_integration_health", {}, sales)).rejects.toMatchObject({ status: 403 });
    await expect(runCommand("list_chat_user_links", {}, sales)).rejects.toMatchObject({ status: 403 });
    expect(await runCommand("get_notification_preferences", {}, sales)).toMatchObject({ preferences: expect.arrayContaining([expect.objectContaining({ reason: "submitted_order", enabled: true })]) });
    const requestId = crypto.randomUUID(), execution = { requestId, correlationId: requestId };
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 36 }, ctx, execution);
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 48 }, ctx);
    await runCommand("set_brewery_operating_defaults", { readingDueHours: 36 }, ctx, execution);
    expect(await runCommand("get_brewery_operating_defaults", {}, ctx)).toMatchObject({ fermentation_reading_due_hours: 48 });
  });
  it("rejects arbitrary destinations through the direct authenticated RPC", async () => {
    const r = await ctx.db.rpc("set_notification_destination", { p_installation: installation, p_external_destination_id: "C-PUBLIC" });
    expect(r.error).not.toBeNull();
  });
  it("replays quiet hours without overwriting a newer change and rejects other selected breweries", async () => {
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const input = { installationId: installation, start: "21:00", end: "06:00" };
    await runCommand("set_brewery_quiet_hours", input, ctx, execution);
    await runCommand("set_brewery_quiet_hours", { ...input, start: "22:00" }, ctx);
    await runCommand("set_brewery_quiet_hours", input, ctx, execution);
    expect((await admin.from("chat_installations").select("quiet_hours_start").eq("id", installation).single()).data?.quiet_hours_start).toBe("22:00:00");
    const b = await makeBrewery();
    await ins("brewery_users", { brewery_id: b.id, user_id: ctx.userId, role: "admin" });
    await expect(runCommand("set_brewery_quiet_hours", input, { ...ctx, breweryId: b.id })).rejects.toMatchObject({ status: 403 });
  });
});


it("previews actual identities without consuming and requires explicit, replay-safe consent", async () => {
  process.env.APP_URL = "https://mgr.test";
  const person = await makeStaffCtx(ctx.breweryId, "sales");
  const issued = await issueChatLinkProof(admin, installation, "U-CONSENT");
  const preview = await runCommand("get_chat_link_intent", { proof: issued.proof }, person);
  expect(preview).toMatchObject({ slackIdentity: "U-CONSENT", brewery: expect.any(String), mgrIdentity: expect.any(String) });
  expect((await admin.from("chat_user_links").select("state").eq("id", issued.linkId).single()).data?.state).toBe("pending");
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const result = await runCommand("consume_chat_link_proof", { proof: issued.proof }, person, execution);
  expect(await runCommand("consume_chat_link_proof", { proof: issued.proof }, person, execution)).toEqual(result);
  expect(await runCommand("get_chat_link_intent", { proof: issued.proof }, person)).toBeNull();
});

it("validates channel privacy on the server and binds durable proofs to actor, generation, tenant and request", async () => {
  process.env.APP_URL = "https://mgr.test";
  let info = { is_private: false, is_archived: false, is_member: true, is_shared: false, is_ext_shared: false, is_pending_ext_shared: false };
  const read = vi.spyOn(slackAdapterModule, "slackClientFor").mockReturnValue({ conversationsInfo: async () => info, postMessage: async () => { throw new Error("unexpected provider send"); }, updateMessage: async () => { throw new Error("unexpected provider update"); }, publishHome: async () => { throw new Error("unexpected provider publish"); },
  } as SlackClientLike);
  try {
    const input = { installationId: installation, externalDestinationId: "C-VALIDATED" };
    await expect(runCommand("set_notification_destination", input, ctx)).rejects.toThrow(/private channel/);
    info = { ...info, is_private: true };
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const result = await runCommand("set_notification_destination", input, ctx, execution);
    expect(await runCommand("set_notification_destination", input, ctx, execution)).toEqual(result);
    for (const flag of ["is_archived", "is_shared", "is_ext_shared", "is_pending_ext_shared"] as const) {
      info = { ...info, [flag]: true };
      await expect(runCommand("set_notification_destination", input, ctx)).rejects.toThrow(/private channel/);
      info = { ...info, [flag]: false };
    }
    info = { ...info, is_member: false };
    expect(await runCommand("set_notification_destination", input, ctx, execution)).toEqual(result);
    await expect(runCommand("set_notification_destination", input, ctx)).rejects.toThrow(/private channel/);
    expect((await ctx.db.rpc("chat_settings_request_completed", { p_brewery: ctx.breweryId, p_user: ctx.userId, p_request_id: execution.requestId })).error).not.toBeNull();
    const version = (await admin.from("chat_installations").select("updated_at").eq("id", installation).single()).data!.updated_at;
    const request = crypto.randomUUID();
    await runCommand("set_brewery_quiet_hours", { installationId: installation, start: "20:00", end: "06:00" }, ctx);
    const stale = await admin.rpc("set_notification_destination", {
      p_brewery: ctx.breweryId, p_installation: installation, p_external_destination_id: "C-STALE",
      p_request_id: request, p_actor: ctx.userId, p_version: version,
    });
    expect(stale.error?.message).toMatch(/changed|validated/);
    expect((await ctx.db.rpc("set_notification_destination", {
      p_brewery: ctx.breweryId, p_installation: installation, p_external_destination_id: "C-STALE", p_request_id: request,
    })).error).not.toBeNull();
    expect((await admin.from("notification_destinations").select("external_destination_id").eq("installation_id", installation).eq("kind", "private_channel").eq("state", "active").single()).data?.external_destination_id).toBe("C-VALIDATED");
  } finally { read.mockRestore(); }
});


it("reports queue counts, successful timestamps and only redacted health fields", async () => {
  const stamp = "2026-09-08T09:00:00+00:00";
  await admin.from("chat_installations").update({ last_failure_code: "xoxb-sensitive", granted_capabilities: { scopes: ["chat:write", "xoxb-sensitive"] } }).eq("id", installation);
  await admin.from("notification_deliveries").update({ sent_at: stamp, state: "retrying" }).eq("id", delivery);
  await ins("chat_callback_receipts", { brewery_id: ctx.breweryId, installation_id: installation, provider: "slack", callback_id: crypto.randomUUID(), callback_kind: "app_home_opened", disposition: "processed", payload_hash: "fixture", received_at: stamp, completed_at: stamp });
  const health = await runCommand("get_chat_integration_health", {}, ctx) as { installation: { lastError: string; scopes: string[] }; queue: { retrying: number }; lastCallback: string; lastDelivery: string };
  expect(health.installation).toMatchObject({ lastError: "provider_error", scopes: ["chat:write"] });
  expect(health.queue.retrying).toBeGreaterThanOrEqual(1);
  expect(new Date(health.lastCallback).getTime()).toBeGreaterThanOrEqual(new Date(stamp).getTime());
  expect(new Date(health.lastDelivery).getTime()).toBe(new Date(stamp).getTime());
  expect(JSON.stringify(health)).not.toContain("xoxb-sensitive");
});

it("admits only current admins for disable and preserves completed lifecycle replay", async () => {
  const b = await makeBrewery(), owner = await makeStaffCtx(b.id), staff = await makeStaffCtx(b.id, "sales");
  const i = await ins("chat_installations", { brewery_id: b.id, provider: "slack", external_installation_id: b.id, display_label: "Lifecycle", state: "active", installer_user_id: owner.userId, token_store_key: b.id });
  const input = { installationId: i.id }, execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  await expect(runCommand("disable_chat_installation", input, staff)).rejects.toMatchObject({ status: 403 });
  await expect(runCommand("disconnect_chat_installation", input, staff)).rejects.toMatchObject({ status: 403 });
  await runCommand("disable_chat_installation", input, owner, execution);
  expect(await runCommand("get_chat_integration_health", {}, owner)).toMatchObject({ installation: { state: "disabled" } });
  await admin.from("chat_installations").update({ state: "active" }).eq("id", i.id);
  await runCommand("disable_chat_installation", input, owner, execution);
  expect(await runCommand("get_chat_integration_health", {}, owner)).toMatchObject({ installation: { state: "active" } });
  const other = { ...owner, breweryId: ctx.breweryId };
  await ins("brewery_users", { brewery_id: ctx.breweryId, user_id: owner.userId, role: "admin" });
  await expect(runCommand("disable_chat_installation", input, other)).rejects.toMatchObject({ status: 403 });
});

it("reads own saved preferences before linking and after unlinking without exposing another staff member’s rows", async () => {
  process.env.APP_URL = "https://mgr.test";
  const person = await makeStaffCtx(ctx.breweryId, "sales");
  await runCommand("set_notification_preference", { reason: "submitted_order", enabled: false }, person);
  await runCommand("set_personal_quiet_hours", { start: "22:00", end: "07:00", timezone: "America/New_York" }, person);
  const saved = { preferences: expect.arrayContaining([{ reason: "submitted_order", enabled: false }]), quietStart: "22:00:00", quietEnd: "07:00:00", timezone: "America/New_York", link: null };
  expect(await runCommand("get_notification_preferences", {}, person)).toMatchObject(saved);
  const proof = await issueChatLinkProof(admin, installation, "U-PRESERVED-PREFS");
  await runCommand("consume_chat_link_proof", { proof: proof.proof }, person);
  await runCommand("unlink_chat_user", { linkId: proof.linkId }, person);
  expect(await runCommand("get_notification_preferences", {}, person)).toMatchObject(saved);
  const other = await makeStaffCtx(ctx.breweryId, "sales");
  expect((await other.db.from("notification_preferences").select("reason").eq("user_id", person.userId)).data).toEqual([]);
  await admin.from("brewery_users").delete().eq("brewery_id", ctx.breweryId).eq("user_id", person.userId);
  expect((await person.db.from("notification_preferences").select("reason")).data).toEqual([]);
});
