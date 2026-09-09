// lib/supabase/integration-tokens.ts — the only server boundary for private integration credentials.
import "server-only";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { createAdminClient } from "@/lib/supabase/admin";

export type IntegrationProvider = "qbo" | "square";

type TokenInput = {
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken: string;
};

type IntegrationTokens = {
  accessToken: string;
  refreshToken: string;
};
type VersionedIntegrationTokens = IntegrationTokens & { credentialVersion: number; connectionId: string };

type ConnectionRow = { id: string };
type TokenRow = { access_token: string; refresh_token: string; credential_version: number };

function requireIntegrationRole(ctx: Ctx) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("integration access requires admin or sales", 403);
  }
}

function isConnectionRow(data: unknown): data is ConnectionRow {
  return typeof data === "object" && data !== null && typeof (data as ConnectionRow).id === "string";
}

function isTokenRow(data: unknown): data is TokenRow {
  return typeof data === "object" && data !== null
    && typeof (data as TokenRow).access_token === "string"
    && typeof (data as TokenRow).refresh_token === "string"
    && typeof (data as TokenRow).credential_version === "number";
}

async function requireVisibleConnection(ctx: Ctx, provider: IntegrationProvider): Promise<string> {
  const query = provider === "qbo"
    ? ctx.db.from("qbo_connections").select("id").eq("brewery_id", ctx.breweryId).maybeSingle()
    : ctx.db.from("pos_connections").select("id").eq("brewery_id", ctx.breweryId).eq("provider", provider).maybeSingle();
  const { data, error } = await query;
  if (error || !isConnectionRow(data)) {
    throw new CommandError("integration connection is not available for this brewery", 403);
  }
  return data.id;
}

async function authorizeTokenAccess(ctx: Ctx, provider: IntegrationProvider): Promise<string> {
  requireIntegrationRole(ctx);
  return requireVisibleConnection(ctx, provider);
}

export async function storeIntegrationTokens(ctx: Ctx, input: TokenInput): Promise<void> {
  if (!input.accessToken || !input.refreshToken) {
    throw new CommandError("integration tokens are required");
  }
  const connectionId = await authorizeTokenAccess(ctx, input.provider);

  const { data, error } = await createAdminClient().rpc("store_integration_tokens", {
    p_brewery: ctx.breweryId,
    p_provider: input.provider,
    p_connection: connectionId,
    p_actor: ctx.userId,
    p_access_token: input.accessToken,
    p_refresh_token: input.refreshToken,
  });
  if (error) throw new Error("integration token storage failed");
  if (data !== true) throw new CommandError("integration access is no longer available", 403);
}

export async function readIntegrationTokens(ctx: Ctx, provider: IntegrationProvider): Promise<IntegrationTokens> {
  const { accessToken, refreshToken } = await readVersionedIntegrationTokens(ctx, provider);
  return { accessToken, refreshToken };
}

export async function readVersionedIntegrationTokens(ctx: Ctx, provider: IntegrationProvider): Promise<VersionedIntegrationTokens> {
  const connectionId = await authorizeTokenAccess(ctx, provider);

  const { data, error } = await createAdminClient()
    .rpc("read_integration_tokens", {
      p_brewery: ctx.breweryId,
      p_provider: provider,
      p_connection: connectionId,
      p_actor: ctx.userId,
    })
    .maybeSingle();
  if (error || !isTokenRow(data)) throw new CommandError("integration tokens are not available", 404);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, credentialVersion: data.credential_version, connectionId };
}

export async function claimQboOAuth(stateHash: string, actorId: string, breweryId: string, redirectUri: string) {
  const { data, error } = await createAdminClient().rpc("claim_qbo_oauth", {
    p_state_hash: stateHash, p_actor: actorId, p_brewery: breweryId, p_redirect_uri: redirectUri,
  }).maybeSingle();
  if (error || !data) return null;
  const row = data as { intent_id: string; brewery_id: string; provider_intent: "connect" | "reconnect" };
  return { intentId: row.intent_id, breweryId: row.brewery_id, providerIntent: row.provider_intent };
}

export async function completeQboOAuthStore(intentId: string, actorId: string, realmId: string, tokens: import("@/lib/qbo").QboTokens) {
  const { data, error } = await createAdminClient().rpc("complete_qbo_oauth", {
    p_intent: intentId, p_actor: actorId, p_realm_id: realmId, p_realm_label: realmId,
    p_access_token: tokens.accessToken, p_refresh_token: tokens.refreshToken,
    p_received_at: tokens.receivedAt,
    p_access_seconds: tokens.accessExpiresIn, p_refresh_seconds: tokens.refreshExpiresIn, p_hard_seconds: tokens.refreshHardExpiresIn,
  });
  if (error || typeof data !== "string") throw new Error("QuickBooks connection storage failed");
  return data;
}

export async function failQboOAuth(intentId: string, actorId: string) {
  const { error } = await createAdminClient().rpc("fail_qbo_oauth", { p_intent: intentId, p_actor: actorId });
  if (error) throw new Error("QuickBooks recovery state could not be recorded");
}

export async function compareAndSwapQboTokens(ctx: Ctx, expected: VersionedIntegrationTokens, next: import("@/lib/qbo").QboTokens) {
  const { data, error } = await createAdminClient().rpc("cas_integration_tokens", {
    p_brewery: ctx.breweryId, p_provider: "qbo", p_connection: expected.connectionId, p_actor: ctx.userId,
    p_expected_version: expected.credentialVersion, p_access_token: next.accessToken, p_refresh_token: next.refreshToken,
    p_received_at: next.receivedAt,
    p_access_seconds: next.accessExpiresIn, p_refresh_seconds: next.refreshExpiresIn, p_hard_seconds: next.refreshHardExpiresIn,
  });
  if (error) throw new Error("QuickBooks token refresh storage failed");
  if (data !== true) throw new CommandError("QuickBooks connection changed; retry with the current connection", 409, "conflict");
}

export async function getQboHealth(ctx: Ctx) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const { data, error } = await ctx.db.from("qbo_connections")
    .select("id,realm_label,state,remote_revocation_state,last_error,access_expires_at,refresh_expires_at,refresh_hard_expires_at")
    .eq("brewery_id", ctx.breweryId).maybeSingle();
  if (error) throw new Error("QuickBooks health is unavailable");
  if (!data) return { connected: false, state: "disconnected" as const, realmLabel: null, lastError: null };
  return {
    connected: data.state === "connected", state: data.state as "connected" | "disconnected" | "recovery_required",
    realmLabel: data.realm_label as string | null, remoteRevocationState: data.remote_revocation_state as string,
    lastError: data.last_error as string | null, accessExpiresAt: data.access_expires_at as string | null,
    refreshExpiresAt: data.refresh_expires_at as string | null, refreshHardExpiresAt: data.refresh_hard_expires_at as string | null,
  };
}

export async function disconnectQbo(ctx: Ctx, connectionId: string, revoke: (token: string) => Promise<void>, requestId: string) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_qbo_disconnect", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_request_id: requestId,
  }).maybeSingle();
  if (error) throw new Error("QuickBooks disconnect failed");
  const row = data as { refresh_token?: unknown } | null;
  const token = typeof row?.refresh_token === "string" ? row.refresh_token : null;
  let revoked = false;
  if (token) revoked = await revoke(token).then(() => true, () => false);
  const { data: finished, error: finishError } = await admin.rpc("finish_qbo_disconnect", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_revoked: revoked,
  });
  if (finishError || finished !== true) throw new Error("QuickBooks disconnect reconciliation failed");
  return { disconnected: true, remoteRevocationState: revoked ? "confirmed" : "unresolved" };
}
