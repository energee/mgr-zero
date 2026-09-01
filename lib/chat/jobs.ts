// lib/chat/jobs.ts — the chat internal-job owner: the only module outside
// lib/commands/invites.ts allowed to construct the service-role client
// (ARCHITECTURE.md iron rule 4, explicit allowlist). It serves provider
// webhooks and scheduled jobs where no user exists, calls only the named
// service_role chat RPCs, never ordinary domain commands, and never mints a
// user token. Delivery orchestration (scan/lease/deliver/cleanup) lands here
// in the worker task.
import { createHash } from "node:crypto";
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrap } from "@/lib/commands/registry";
import { assertPortableNotification, type NotificationReason, type PortableNotification } from "./contracts";
import type { ChatProviderTransport, ProviderMessageRef } from "./provider";
import { issueChatLinkProof } from "./linking";
import { chatStatePool } from "./state";
import { SlackTransport, classifySlackError } from "./slack-transport";
import { slackClientFor } from "./slack-adapter";

let client: SupabaseClient | undefined;
export function serviceClient(): SupabaseClient {
  client ??= createAdminClient();
  return client;
}

export function slackTransport() {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL is not configured");
  return new SlackTransport(slackClientFor, { mgrBaseUrl: base });
}

type SlackEventBody = {
  type?: string; team_id?: string; event_id?: string;
  event?: { type?: string; user?: string; tab?: string };
};

// Records a durable receipt for a Slack event whose transport authenticity the
// Chat SDK already verified. Only Home-tab App Home opens are recorded now;
// the worker claims pending receipts and publishes the view. Returns null when
// nothing needed recording. Throws when the receipt could not be recorded so
// the route can answer with a retryable failure.
export async function recordSlackCallback(rawBody: string): Promise<{ receiptId: string | null; duplicate: boolean } | null> {
  let body: SlackEventBody;
  try { body = JSON.parse(rawBody) as SlackEventBody; } catch { return null; }
  if (body.type !== "event_callback" || body.event?.type !== "app_home_opened") return null;
  if ((body.event.tab ?? "home") !== "home") return null;
  if (!body.team_id || !body.event_id || !body.event.user) return null;
  const result = await unwrap(serviceClient().rpc("record_chat_callback_receipt", {
    p_provider: "slack",
    p_external_installation_id: body.team_id,
    p_callback_id: body.event_id,
    p_callback_kind: "app_home_opened",
    p_external_user_id: body.event.user,
    p_payload_hash: createHash("sha256").update(rawBody).digest("hex"),
  })) as { receipt_id: string | null; duplicate: boolean } | null;
  if (!result) return null; // no active installation for that workspace: ignore
  return { receiptId: result.receipt_id, duplicate: result.duplicate };
}

// ---------------------------------------------------------------- worker orchestration

type Occurrence = {
  id: string; reason: NotificationReason; state: string; subject_type: PortableNotification["subject"]["type"]; subject_id: string;
  urgency: "normal" | "attention"; due_at: string | null; semantic_key: string;
  payload: { safe_label: string; detail: string; href: string; recipient_roles: string[]; assigned_user_id: string | null; window?: string };
};
type DeliveryContext = {
  delivery: { id: string; state: string; attempt_count: number; provider_conversation_id: string | null; provider_message_id: string | null; resolved_at: string | null };
  occurrence: Occurrence;
  destination: { id: string; kind: "personal" | "private_channel"; external_destination_id: string; state: string; user_id: string | null };
  installation: { id: string; state: string; external_installation_id: string; provider: string; brewery_id: string };
  link_active: boolean;
  preference_enabled: boolean;
  counts: Record<string, number> | null;
};
type Lease = { id: string; occurrence_id: string; destination_id: string; installation_id: string; provider: string; lease_expires_at: string; attempt_count: number };
type Deps = { db?: SupabaseClient; transport?: ChatProviderTransport; now?: Date };

const TITLE: Record<NotificationReason, string> = {
  submitted_order: "Review submitted order", pick_due: "Pick due", delivery_next: "Next stop",
  fermentation_reading_overdue: "Reading overdue", operations_digest: "Operations digest",
};
const OWNER: Record<NotificationReason, PortableNotification["ownerClass"]> = {
  submitted_order: "sales", pick_due: "warehouse", delivery_next: "driver", fermentation_reading_overdue: "brewer", operations_digest: "team",
};
const DIGEST_LINES: [NotificationReason, string][] = [
  ["submitted_order", "Submitted orders"], ["pick_due", "Picks due"], ["delivery_next", "Assigned deliveries"], ["fermentation_reading_overdue", "Fermentation readings"],
];
const REAUTH_CODES = new Set(["invalid_auth", "token_revoked", "account_inactive", "token_expired", "not_authed"]);

export function toNotification(o: Occurrence): PortableNotification {
  const n: PortableNotification = {
    reason: o.reason, urgency: o.urgency,
    subject: { type: o.subject_type, id: o.subject_id, safeLabel: o.payload.safe_label },
    title: TITLE[o.reason], detail: o.payload.detail, dueAt: o.due_at, ownerClass: OWNER[o.reason], resolutionKey: o.semantic_key,
    actions: [{ id: "open_mgr", label: "Open in MGR", url: o.payload.href, enabled: true }],
  };
  assertPortableNotification(n);
  return n;
}

function digestNotification(ctx: DeliveryContext): PortableNotification {
  const counts = ctx.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + Number(b), 0);
  const window = ctx.occurrence.payload.window === "midday" ? "Midday" : "Morning";
  return {
    reason: "operations_digest", urgency: "normal",
    subject: { type: "digest", id: ctx.destination.id, safeLabel: `${window} operations · ${total} waiting` },
    title: "Unresolved work", detail: DIGEST_LINES.map(([r, label]) => `${label}: ${Number(counts[r] ?? 0)}`).join("\n"),
    dueAt: ctx.occurrence.due_at, ownerClass: "team", resolutionKey: ctx.occurrence.semantic_key,
    actions: [{ id: "open_mgr", label: "Open my MGR work", url: "/", enabled: true }],
  };
}

export const backoffMs = (attempt: number) => Math.min(3600, 2 ** Math.min(attempt, 10)) * 1000 * (1 + Math.random() * 0.25);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// ponytail: in-process per-conversation pacing (one send/second); a shared
// limiter is needed only if the worker ever runs on more than one instance.
const lastSend = new Map<string, number>();
async function paceConversation(key: string) {
  const wait = (lastSend.get(key) ?? 0) + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastSend.set(key, Date.now());
}

export async function runChatScan({ now = new Date(), db = serviceClient() }: Deps = {}) {
  const targets = (await unwrap(db.rpc("list_chat_scan_targets"))) as string[];
  for (const brewery of targets) {
    await unwrap(db.rpc("scan_chat_notification_occurrences", { p_brewery: brewery, p_now: now.toISOString() }));
  }
  return { breweries: targets.length };
}

// App Home opens: publish the link screen (issuing a fresh single-use proof)
// or, for an actively linked user, a fresh scan's current active items.
export async function runChatCallbackBatch({ limit = 25, now = new Date(), db = serviceClient(), transport = slackTransport() }: Deps & { limit?: number } = {}) {
  const claimed = (await unwrap(db.rpc("claim_chat_callback_receipts", { p_limit: limit, p_now: now.toISOString() }))) as
    { id: string; brewery_id: string; installation_id: string; external_installation_id: string; external_user_id: string; callback_kind: string }[];
  let processed = 0, failed = 0;
  for (const r of claimed) {
    const done = (disposition: "processed" | "ignored" | "failed", code: string | null = null) =>
      unwrap(db.rpc("complete_chat_callback_receipt", { p_receipt: r.id, p_disposition: disposition, p_error_code: code }));
    try {
      if (r.callback_kind !== "app_home_opened" || !r.external_user_id) { await done("ignored"); continue; }
      const items = (await unwrap(db.rpc("get_chat_home_items", { p_installation: r.installation_id, p_external_user_id: r.external_user_id }))) as Occurrence[] | null;
      if (items === null) {
        const proof = await issueChatLinkProof(db, r.installation_id, r.external_user_id);
        await transport.publishHome({ installationId: r.external_installation_id, externalUserId: r.external_user_id, items: [], linkUrl: proof.url });
      } else {
        await unwrap(db.rpc("scan_chat_notification_occurrences", { p_brewery: r.brewery_id, p_now: now.toISOString() }));
        const fresh = ((await unwrap(db.rpc("get_chat_home_items", { p_installation: r.installation_id, p_external_user_id: r.external_user_id }))) as Occurrence[] | null) ?? [];
        await transport.publishHome({ installationId: r.external_installation_id, externalUserId: r.external_user_id, items: fresh.map(toNotification) });
      }
      await done("processed"); processed++;
    } catch (e) {
      await done("failed", classifySlackError(e).code).catch(() => undefined); failed++;
    }
  }
  return { processed, failed };
}

// Leases due deliveries, re-checks everything from server state, then sends or
// updates. Persists only provider ids and redacted codes.
export async function runChatDeliveryBatch({ limit = 50, now = new Date(), db = serviceClient(), transport = slackTransport() }: Deps & { limit?: number } = {}) {
  const leased = (await unwrap(db.rpc("lease_chat_deliveries", { p_limit: limit, p_lease_seconds: 60, p_now: now.toISOString() }))) as Lease[];
  const counts = { sent: 0, updated: 0, suppressed: 0, retried: 0, terminal: 0 };
  for (const lease of leased) {
    const stop = async (state: "suppressed" | "terminal", code: string) => {
      await unwrap(db.rpc("suppress_chat_delivery", { p_delivery: lease.id, p_lease: lease.lease_expires_at, p_state: state, p_error_code: code }));
      counts[state]++;
    };
    const complete = async (ref: ProviderMessageRef, kind: "sent" | "updated") => {
      await unwrap(db.rpc("complete_chat_delivery", { p_delivery: lease.id, p_lease: lease.lease_expires_at, p_conversation_id: ref.conversationId, p_message_id: ref.messageId }));
      counts[kind]++;
    };
    const ctx = (await unwrap(db.rpc("get_chat_delivery_context", { p_delivery: lease.id }))) as DeliveryContext | null;
    if (!ctx) { await stop("terminal", "context_missing"); continue; }
    if (ctx.installation.state !== "active") { await stop("terminal", "installation_inactive"); continue; }
    if (ctx.destination.state !== "active") { await stop("terminal", "destination_blocked"); continue; }
    const personal = ctx.destination.kind === "personal";
    if (personal && (!ctx.link_active || !ctx.preference_enabled)) { await stop("suppressed", "recipient_ineligible"); continue; }
    const resolved = ctx.occurrence.state !== "active";
    const existing = ctx.delivery.provider_message_id && ctx.delivery.provider_conversation_id
      ? { conversationId: ctx.delivery.provider_conversation_id, messageId: ctx.delivery.provider_message_id } : null;
    if (resolved && !existing) { await stop("suppressed", "resolved"); continue; }
    const notification = ctx.occurrence.reason === "operations_digest" ? digestNotification(ctx) : toNotification(ctx.occurrence);
    const installationId = ctx.installation.external_installation_id;
    try {
      if (!personal && !existing) {
        const check = await transport.validateDestination({ installationId, destinationId: ctx.destination.external_destination_id });
        if (!check.ok) {
          await unwrap(db.rpc("block_notification_destination", { p_destination: ctx.destination.id, p_reason: check.reason }));
          await stop("terminal", check.reason); continue;
        }
      }
      await paceConversation(`${installationId}:${ctx.destination.external_destination_id}`);
      if (existing) {
        await transport.update({ installationId, ref: existing, notification, intentId: lease.id, resolved });
        await complete(existing, "updated");
      } else {
        const ref = await transport.send({ installationId, destinationId: ctx.destination.external_destination_id, notification, intentId: lease.id });
        await complete(ref, "sent");
      }
    } catch (e) {
      const cls = classifySlackError(e);
      if (cls.retryable) {
        const next = new Date(now.getTime() + (cls.retryAfterMs ?? backoffMs(lease.attempt_count)));
        await unwrap(db.rpc("retry_chat_delivery", { p_delivery: lease.id, p_lease: lease.lease_expires_at, p_next_attempt_at: next.toISOString(), p_error_code: cls.code }));
        counts.retried++;
      } else {
        await stop("terminal", cls.code);
        if (REAUTH_CODES.has(cls.code)) {
          await unwrap(db.rpc("mark_chat_installation_reauthorization", { p_installation: ctx.installation.id, p_failure_code: cls.code })).catch(() => undefined);
        }
      }
    }
  }
  return counts;
}

// Deletes only expired rows from the private Chat SDK state tables through the
// restricted pool; subscriptions are never touched.
export async function cleanupChatState({ now = new Date(), pool = chatStatePool() }: { now?: Date; pool?: pg.Pool } = {}) {
  let deleted = 0;
  for (const table of ["chat_state_locks", "chat_state_cache", "chat_state_lists", "chat_state_queues"]) {
    const r = await pool.query(`delete from chat_sdk.${table} where expires_at is not null and expires_at <= $1`, [now]);
    deleted += r.rowCount ?? 0;
  }
  return { deleted };
}
