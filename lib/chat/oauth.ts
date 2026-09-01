// lib/chat/oauth.ts — Slack installation lifecycle services: OAuth intent start,
// callback completion, reconciliation, and disconnect. Provider I/O goes through
// SlackOAuthPort so tests run against a fake; durable state lives in the
// chat_installations lifecycle RPCs (baseline § chat installation lifecycle).
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";

export const PROVIDER = "slack";
export const REQUIRED_SLACK_SCOPES = ["chat:write", "im:write", "groups:read"] as const;

export type SlackOAuthPort = {
  handleOAuthCallback(request: Request, options: { redirectUri: string }): Promise<{
    teamId: string;
    enterpriseId?: string;
    isEnterpriseInstall: boolean;
    teamName?: string;
    scopes: readonly string[];
  }>;
  getInstallation(id: string): Promise<{ botToken: string } | null>;
  deleteInstallation(id: string): Promise<void>;
};

type Intent = {
  installation_id: string;
  brewery_id: string;
  state: string;
  kind: "install" | "reauthorize";
  redirect_uri: string;
  expires_at: string;
  consumed_at: string | null;
  external_installation_id: string;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Lifecycle RPCs return bounded JSON; a null result means the row vanished.
async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const data = await unwrap(db.rpc(name, args));
  if (data == null) throw new CommandError(`${name} returned nothing`, 404);
  return data as T;
}

function authorizeUrl(state: string, redirectUri: string) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new CommandError("SLACK_CLIENT_ID is not configured", 500);
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", REQUIRED_SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function beginIntent(ctx: Ctx, redirectUri: string, name: string, args: Record<string, unknown>) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const state = randomBytes(32).toString("base64url");
  const result = await rpc<{ installation_id: string }>(ctx.db, name, { ...args, p_redirect_uri: redirectUri, p_state_hash: sha256(state) });
  return { installationId: result.installation_id, authorizeUrl: authorizeUrl(state, redirectUri) };
}

export function beginSlackInstall(ctx: Ctx, redirectUri: string) {
  return beginIntent(ctx, redirectUri, "begin_chat_installation", { p_brewery: ctx.breweryId, p_provider: PROVIDER });
}

export function beginSlackReauthorization(ctx: Ctx, installationId: string, redirectUri: string) {
  return beginIntent(ctx, redirectUri, "begin_chat_reauthorization", { p_installation: installationId });
}

const sameScopes = (granted: readonly string[]) =>
  granted.length === REQUIRED_SLACK_SCOPES.length && REQUIRED_SLACK_SCOPES.every((scope) => granted.includes(scope));

// Validates the intent before any token exchange, exchanges the code (Chat SDK
// stores the token in its private state), then activates the MGR mapping. Any
// failure after the exchange deletes the credential the SDK just stored.
export async function completeSlackInstall(db: SupabaseClient, request: Request, port: SlackOAuthPort, redirectUri: string) {
  const params = new URL(request.url).searchParams;
  if (params.get("error")) throw new CommandError("oauth cancelled", 400);
  const state = params.get("state");
  if (!state) throw new CommandError("oauth state missing", 400);
  const intent = await unwrap<Intent | null>(db.rpc("find_chat_oauth_intent", { p_state_hash: sha256(state) }));
  if (!intent) throw new CommandError("oauth state invalid", 400);
  if (intent.consumed_at && intent.state === "active") {
    return { installationId: intent.installation_id, breweryId: intent.brewery_id, replayed: true };
  }
  if (intent.consumed_at) throw new CommandError("oauth state already used", 400);
  if (new Date(intent.expires_at).getTime() < Date.now()) throw new CommandError("oauth state expired", 400);
  if (intent.redirect_uri !== redirectUri) throw new CommandError("oauth redirect mismatch", 400);

  const granted = await port.handleOAuthCallback(request, { redirectUri });
  const externalId = granted.teamId;
  try {
    if (!sameScopes(granted.scopes)) throw new CommandError("oauth scope mismatch", 400);
    const result = await rpc<{ installation_id: string; replayed: boolean }>(db, "activate_chat_installation", {
        p_installation: intent.installation_id,
        p_state_hash: sha256(state),
        p_redirect_uri: redirectUri,
        p_external_installation_id: externalId,
        p_external_enterprise_id: granted.enterpriseId ?? null,
        p_display_label: granted.teamName ?? externalId,
        p_token_store_key: `slack:installation:${externalId}`,
        p_granted_capabilities: { scopes: [...granted.scopes], enterprise: granted.isEnterpriseInstall },
    });
    return { installationId: result.installation_id, breweryId: intent.brewery_id, replayed: result.replayed };
  } catch (e) {
    // Never keep a credential MGR could not bind; if this delete fails too,
    // the reconciler retries from the durable intent.
    await port.deleteInstallation(externalId).catch(() => undefined);
    throw e;
  }
}

// Reconciler entry point for a partial install: the token exists but the MGR
// row never activated. Runs with the service-role client from a job.
export async function reconcileSlackInstall(db: SupabaseClient, installationId: string, port: SlackOAuthPort) {
  const { data: r } = await db
    .from("chat_installations")
    .select("state, external_installation_id")
    .eq("id", installationId)
    .single();
  if (!r) throw new CommandError("installation not found", 404);
  let credentialDeleted = false;
  if (r.state !== "active" && !r.external_installation_id.startsWith("pending:")) {
    credentialDeleted = await port
      .deleteInstallation(r.external_installation_id)
      .then(() => true, () => false);
  }
  await unwrap(db.rpc("reconcile_chat_installation", {
    p_installation: installationId,
    p_credential_deleted: credentialDeleted,
    p_failure_code: credentialDeleted ? null : "credential_delete_failed",
  }));
  return { credentialDeleted };
}

// Disable-first: the RPC marks the row disconnected and invalidates links,
// destinations, and action intents before the provider credential is touched.
export async function disconnectSlackInstallation(ctx: Ctx, installationId: string, port: SlackOAuthPort) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const r = await rpc<{ external_installation_id: string }>(ctx.db, "disconnect_chat_installation", { p_installation: installationId });
  const credentialDeleted = r.external_installation_id.startsWith("pending:")
    ? true
    : await port.deleteInstallation(r.external_installation_id).then(() => true, () => false);
  await unwrap(ctx.db.rpc("reconcile_chat_installation", {
    p_installation: installationId,
    p_credential_deleted: credentialDeleted,
    p_failure_code: credentialDeleted ? null : "credential_delete_failed",
  }));
  return { credentialDeleted };
}
