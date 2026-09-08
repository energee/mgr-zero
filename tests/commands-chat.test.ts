import { beforeAll, describe, expect, it } from "vitest";
import { admin, ins, makeBrewery, makeStaffCtx, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

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
