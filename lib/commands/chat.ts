// lib/commands/chat.ts — RLS-bound chat integration commands: staff linking
// (consume proof, unlink, link status) and integration-owned settings
// (personal preferences/quiet hours, brewery quiet hours, operations channel).
// None of these touch MGR due state. Every write is one Postgres RPC.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, type StaffRole } from "./registry";
import { sha256 } from "@/lib/chat/linking";

const STAFF: StaffRole[] = ["admin", "sales", "warehouse", "brewer"];
const REASONS = ["submitted_order", "pick_due", "delivery_next", "fermentation_reading_overdue", "operations_digest"] as const;
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM");
const quietHours = z.object({ start: hhmm, end: hhmm, timezone: z.string().min(1).optional() }).nullable().optional();

defineCommand({
  name: "set_notification_preference",
  description: "Mute/unmute one notification reason for yourself and optionally override your quiet hours (chat delivery only; MGR Today is unaffected)",
  input: z.object({ reason: z.enum(REASONS), enabled: z.boolean(), quietHours }),
  roles: STAFF,
  handler: async (ctx, i) => {
    await unwrap(ctx.db.rpc("set_notification_preference", {
      p_brewery: ctx.breweryId, p_reason: i.reason, p_enabled: i.enabled,
      p_quiet_start: i.quietHours?.start ?? null, p_quiet_end: i.quietHours?.end ?? null, p_quiet_tz: i.quietHours?.timezone ?? null,
    }));
    return { ok: true };
  },
});

defineCommand({
  name: "set_brewery_quiet_hours",
  description: "Set the brewery-wide quiet hours (brewery time) that delay every personal chat notification; null clears them",
  input: z.object({ installationId: z.string().uuid(), start: hhmm.nullable(), end: hhmm.nullable() }),
  roles: ["admin"],
  handler: async (ctx, i) => {
    await unwrap(ctx.db.rpc("set_brewery_quiet_hours", { p_installation: i.installationId, p_start: i.start, p_end: i.end }));
    return { ok: true };
  },
});

defineCommand({
  name: "set_notification_destination",
  description: "Choose the one private operations channel that receives the morning and midday digests (replaces the previous one)",
  input: z.object({ installationId: z.string().uuid(), externalDestinationId: z.string().min(1) }),
  roles: ["admin"],
  handler: async (ctx, i) =>
    await unwrap(ctx.db.rpc("set_notification_destination", { p_installation: i.installationId, p_external_destination_id: i.externalDestinationId })) as { id: string },
});

defineCommand({
  name: "consume_chat_link_proof",
  description: "Complete a Slack → MGR account link using the single-use proof from App Home (current staff only)",
  input: z.object({ proof: z.string().min(1) }),
  roles: STAFF,
  handler: async (ctx, i) => {
    const r = await unwrap(ctx.db.rpc("consume_chat_link_proof", { p_proof_hash: sha256(i.proof) })) as
      { link_id: string; installation_id: string; brewery_id: string };
    return { linkId: r.link_id, installationId: r.installation_id, breweryId: r.brewery_id };
  },
});

defineCommand({
  name: "unlink_chat_user",
  description: "Unlink a Slack user from MGR (own link, or any link as admin); stops personal delivery",
  input: z.object({ linkId: z.string().uuid() }),
  roles: STAFF,
  handler: async (ctx, i) => { await unwrap(ctx.db.rpc("unlink_chat_user", { p_link: i.linkId })); return { ok: true }; },
});

defineQuery({
  name: "get_chat_link_status",
  description: "Whether the current user has an active Slack link for an installation",
  input: z.object({ installationId: z.string().uuid() }),
  roles: STAFF,
  handler: async (ctx, i) => {
    const link = await unwrap(
      ctx.db.from("chat_user_links").select("id, linked_at")
        .eq("installation_id", i.installationId).eq("user_id", ctx.userId).eq("state", "active").maybeSingle(),
    );
    return link ? { linked: true as const, linkId: link.id, linkedAt: link.linked_at } : { linked: false as const };
  },
});
