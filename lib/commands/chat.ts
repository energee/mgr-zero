// lib/commands/chat.ts — RLS-bound chat integration commands: staff linking
// (consume proof, unlink, link status) and integration-owned settings
// (personal preferences/quiet hours, brewery quiet hours, operations channel).
// None of these touch MGR due state. Every write is one Postgres RPC.
import { z } from "zod";
import { defineCommand, defineQuery, unwrap, STAFF_ROLES } from "./registry";
import { sha256 } from "@/lib/chat/linking";

const REASONS = ["submitted_order", "pick_due", "restock_due", "delivery_next", "fermentation_reading_overdue", "invoice_question", "operations_digest"] as const;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");
const quietHours = z.object({ start: hhmm, end: hhmm, timezone: z.string().min(1).optional() }).nullable().optional();

defineCommand({
  name: "set_notification_preference",
  description: "Mute/unmute one notification reason for yourself and optionally override your quiet hours (chat delivery only; MGR Today is unaffected)",
  input: z.object({ reason: z.enum(REASONS), enabled: z.boolean(), quietHours }),
  roles: STAFF_ROLES,
  handler: async (ctx, i, execution) => {
    await unwrap(ctx.db.rpc("set_notification_preference", {
      p_request_id: execution.requestId, p_set_quiet: i.quietHours !== undefined,
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
  handler: async (ctx, i, execution) => {
    await unwrap(ctx.db.rpc("set_brewery_quiet_hours", { p_brewery: ctx.breweryId, p_request_id: execution.requestId, p_installation: i.installationId, p_start: i.start, p_end: i.end }));
    return { ok: true };
  },
});

defineCommand({
  name: "set_notification_destination",
  description: "Choose the one private operations channel that receives the morning and midday digests (replaces the previous one)",
  input: z.object({ installationId: z.string().uuid(), externalDestinationId: z.string().min(1) }),
  roles: ["admin"],
  handler: async (ctx, i, execution) => {
    const { validateChatDestination } = await import("@/lib/chat/jobs");
    await validateChatDestination(ctx, i.installationId, i.externalDestinationId, execution.requestId);
    return await unwrap(ctx.db.rpc("set_notification_destination", { p_brewery: ctx.breweryId, p_request_id: execution.requestId,
      p_installation: i.installationId, p_external_destination_id: i.externalDestinationId })) as { id: string };
  },
});

defineCommand({
  name: "consume_chat_link_proof",
  description: "Complete a Slack → MGR account link using the single-use proof from App Home (current staff only)",
  input: z.object({ proof: z.string().min(1) }),
  roles: STAFF_ROLES,
  handler: async (ctx, i, execution) => {
    const r = await unwrap(ctx.db.rpc("consume_chat_link_proof", { p_brewery: ctx.breweryId, p_request_id: execution.requestId, p_proof_hash: sha256(i.proof) })) as
      { link_id: string; installation_id: string; brewery_id: string };
    return { linkId: r.link_id, installationId: r.installation_id, breweryId: r.brewery_id };
  },
});

defineCommand({
  name: "unlink_chat_user",
  description: "Unlink a Slack user from MGR (own link, or any link as admin); stops personal delivery",
  input: z.object({ linkId: z.string().uuid() }),
  roles: STAFF_ROLES,
  handler: async (ctx, i, execution) => { await unwrap(ctx.db.rpc("unlink_chat_user", { p_brewery: ctx.breweryId, p_link: i.linkId, p_request_id: execution.requestId })); return { ok: true }; },
});

defineQuery({
  name: "get_chat_link_status",
  description: "Whether the current user has an active Slack link for an installation",
  input: z.object({ installationId: z.string().uuid() }),
  roles: STAFF_ROLES,
  handler: async (ctx, i) => {
    const link = await unwrap(
      ctx.db.from("chat_user_links").select("id, linked_at")
        .eq("brewery_id", ctx.breweryId).eq("installation_id", i.installationId).eq("user_id", ctx.userId).eq("state", "active").maybeSingle(),
    );
    return link ? { linked: true as const, linkId: link.id, linkedAt: link.linked_at } : { linked: false as const };
  },
});


defineCommand({
  name: "snooze_notification",
  description: "Delay one personal chat reminder for up to seven days; Today due state is unchanged",
  input: z.object({ deliveryId: z.string().uuid(), until: z.iso.datetime({ offset: true }) }),
  roles: STAFF_ROLES,
  handler: async (ctx, i, execution) => await unwrap(ctx.db.rpc("snooze_notification", {
    p_brewery: ctx.breweryId, p_delivery: i.deliveryId, p_until: i.until, p_request_id: execution.requestId,
  })) as { ok: true },
});

defineCommand({
  name: "set_personal_quiet_hours",
  description: "Override personal chat quiet hours for every reason; null clears the override",
  input: z.object({ start: hhmm.nullable(), end: hhmm.nullable(), timezone: z.string().min(1).nullable().optional() }),
  roles: STAFF_ROLES,
  handler: async (ctx, i, execution) => await unwrap(ctx.db.rpc("set_personal_quiet_hours", {
    p_brewery: ctx.breweryId, p_start: i.start, p_end: i.end, p_timezone: i.timezone ?? null, p_request_id: execution.requestId,
  })) as { ok: true },
});

export type ChatHealth = {
  installation: { id: string; workspace: string; state: string; scopes: string[]; quietStart: string | null; quietEnd: string | null; timezone: string | null; lastError: string | null } | null;
  linkedCount: number; queue: Record<string, number>; lastCallback: string | null; lastDelivery: string | null;
  destinations: { id: string; channelId: string; state: string; privacy: string; reason: string | null }[];
};
export type ChatPreferences = { preferences: { reason: typeof REASONS[number]; enabled: boolean }[]; quietStart: string | null; quietEnd: string | null; timezone: string; link: { id: string; external_user_id: string } | null };
export type ChatLinkIntent = { brewery: string; mgrIdentity: string; slackIdentity: string; workspace: string; expiresAt: string };
export type ChatLinkedPerson = { id: string; name: string; role: string; slackIdentity: string; linkedAt: string };

defineQuery({ name: "get_chat_integration_health", description: "Read bounded, redacted Slack integration health for brewery admins",
  input: z.object({}), roles: ["admin"], handler: (ctx) => unwrap(ctx.db.rpc("get_chat_integration_health", { p_brewery: ctx.breweryId })) as Promise<ChatHealth>,
});
defineQuery({ name: "list_chat_user_links", description: "List currently linked staff in this brewery, without link proofs",
  input: z.object({}), roles: ["admin"], handler: (ctx) => unwrap(ctx.db.rpc("list_chat_user_links", { p_brewery: ctx.breweryId })) as Promise<ChatLinkedPerson[]>,
});
defineQuery({ name: "get_chat_link_intent", description: "Preview both identities and the brewery before explicit account-link consent; does not consume the proof",
  input: z.object({ proof: z.string().min(1).max(256) }), roles: STAFF_ROLES,
  handler: (ctx, i) => unwrap(ctx.db.rpc("get_chat_link_intent", { p_brewery: ctx.breweryId, p_proof_hash: sha256(i.proof) })) as Promise<ChatLinkIntent | null>,
});
defineQuery({ name: "get_notification_preferences", description: "Read your own reason preferences, personal quiet hours and Slack link",
  input: z.object({}), roles: STAFF_ROLES,
  handler: async (ctx): Promise<ChatPreferences> => {
    const [preferences, brewery, link] = await Promise.all([
      unwrap(ctx.db.from("notification_preferences").select("reason, enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone").eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId)),
      unwrap(ctx.db.from("breweries").select("timezone").eq("id", ctx.breweryId).single()),
      unwrap(ctx.db.from("chat_user_links").select("id, external_user_id").eq("brewery_id", ctx.breweryId).eq("user_id", ctx.userId).eq("state", "active").maybeSingle()),
    ]);
    const quiet = preferences?.find((p) => p.quiet_hours_start !== null);
    return { preferences: REASONS.map((reason) => ({ reason, enabled: preferences?.find((p) => p.reason === reason)?.enabled ?? true })),
      quietStart: quiet?.quiet_hours_start ?? null, quietEnd: quiet?.quiet_hours_end ?? null, timezone: quiet?.quiet_hours_timezone ?? brewery?.timezone ?? "UTC", link };
  },
});
defineQuery({ name: "list_chat_channels", description: "List private active Slack channels with the bot present and no sharing",
  input: z.object({ installationId: z.string().uuid() }), roles: ["admin"],
  handler: async (ctx, i) => (await import("@/lib/chat/jobs")).listChatChannels(ctx, i.installationId),
});
defineCommand({ name: "begin_chat_installation", description: "Begin explicit administrator consent to install Slack with the three required scopes",
  input: z.object({}), roles: ["admin"],
  handler: async (ctx, _i, execution) => (await import("@/lib/chat/oauth")).beginSlackInstall(ctx, chatRedirectUri(), execution.requestId),
});
defineCommand({ name: "begin_chat_reauthorization", description: "Begin explicit administrator consent to reauthorize the existing Slack workspace",
  input: z.object({ installationId: z.string().uuid() }), roles: ["admin"],
  handler: async (ctx, i, execution) => (await import("@/lib/chat/oauth")).beginSlackReauthorization(ctx, i.installationId, chatRedirectUri(), execution.requestId),
});
defineCommand({ name: "disable_chat_installation", description: "Stop all Slack delivery locally without needing Slack to be reachable",
  input: z.object({ installationId: z.string().uuid() }), roles: ["admin"],
  handler: (ctx, i, execution) => unwrap(ctx.db.rpc("disable_chat_installation", { p_brewery: ctx.breweryId, p_installation: i.installationId, p_request_id: execution.requestId })),
});
defineCommand({ name: "disconnect_chat_installation", description: "Stop Slack delivery and invalidate links, then attempt credential cleanup; retry if cleanup is pending",
  input: z.object({ installationId: z.string().uuid() }), roles: ["admin"],
  handler: async (ctx, i, execution) => {
    const { disconnectSlackInstallation } = await import("@/lib/chat/oauth");
    const { slackOAuthPort } = await import("@/lib/chat/slack-adapter");
    // Construct the provider lazily: local disconnect succeeds even without provider setup.
    return disconnectSlackInstallation(ctx, i.installationId, { deleteInstallation: async (id) => slackOAuthPort().deleteInstallation(id) }, execution.requestId);
  },
});
function chatRedirectUri() {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Chat setup is unavailable");
  return new URL("/api/chat/slack/oauth", base).toString();
}
