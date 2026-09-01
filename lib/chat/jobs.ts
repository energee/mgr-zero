// lib/chat/jobs.ts — the chat internal-job owner: the only module outside
// lib/commands/invites.ts allowed to construct the service-role client
// (ARCHITECTURE.md iron rule 4, explicit allowlist). It serves provider
// webhooks and scheduled jobs where no user exists, calls only the named
// service_role chat RPCs, never ordinary domain commands, and never mints a
// user token. Delivery orchestration (scan/lease/deliver/cleanup) lands here
// in the worker task.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrap } from "@/lib/commands/registry";
import { SlackTransport } from "./slack-transport";
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
