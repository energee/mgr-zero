// lib/supabase/integration-tokens.ts — the only server boundary for private integration credentials.
import "server-only";
import { CommandError, type Ctx } from "@/lib/commands/registry";
import { isUuid } from "@/lib/commands/context";
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
export type VersionedIntegrationTokens = IntegrationTokens & {
  credentialVersion: number;
  connectionId: string;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  refreshHardExpiresAt: string | null;
};

export type SquareCatalogSyncStart = {
  actorId: string;
  connectionId: string;
  merchantId: string;
  credentialVersion: number;
  catalogGeneration: number;
  requestId: string;
};

export type SquareSalesSyncStart = {
  actorId: string;
  requestId: string;
  connectionId: string;
  merchantId: string;
  credentialVersion: number;
  startsAt: string;
  endsAt: string;
  locationsCaptured: boolean;
  locationIds: string[];
  locationOffset: number;
  cursor: string | null;
  pages: number;
};

export type SquareSalesSyncResult = {
  complete: true;
  acceptedFacts: number;
  unsupportedFacts: number;
  pages: number;
  locations: number;
  startsAt: string;
  endsAt: string;
};

export type SquarePublicationStart = {
  attemptId: string;
  connectionId: string;
  credentialVersion: number;
  catalogGeneration: number;
  status: "needs_snapshot" | "prepared" | "succeeded" | "rejected" | "superseded";
  providerKey: string;
  source: import("@/lib/pos").SquarePublicationSource;
  errorCode: string | null;
  result: { published: boolean; retired?: boolean; superseded?: boolean; externalItemId?: string;
    ownership?: "mgr" | "adopted"; variations?: Array<{ formatId: string; externalVariationId: string; retired: boolean }> } | null;
};

export type SquareMenuPublicationStart = {
  menuAttemptId: string;
  connectionId: string;
  credentialVersion: number;
  catalogGeneration: number;
  status: "publishing" | "succeeded" | "superseded";
  manifest: Array<{ brandId: string; requestId: string }>;
  result: { published: boolean; items?: unknown[]; superseded?: boolean; errorCode?: string } | null;
};

export type PortalInvoicePaymentClaim = VersionedIntegrationTokens & {
  realmId: string;
  remoteInvoiceId: string;
  grantedScopes: string[];
};

type ConnectionRow = { id: string };
type TokenRow = {
  access_token: string;
  refresh_token: string;
  credential_version: number;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  refresh_hard_expires_at: string | null;
};

function requireIntegrationRole(ctx: Ctx) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("integration access requires admin or sales", 403);
  }
}

function isConnectionRow(data: unknown): data is ConnectionRow {
  return typeof data === "object" && data !== null && typeof (data as ConnectionRow).id === "string";
}

function isTokenRow(data: unknown): data is TokenRow {
  const nullableString = (value: unknown) => value === null || typeof value === "string";
  return typeof data === "object" && data !== null
    && typeof (data as TokenRow).access_token === "string"
    && typeof (data as TokenRow).refresh_token === "string"
    && typeof (data as TokenRow).credential_version === "number"
    && nullableString((data as TokenRow).access_expires_at)
    && nullableString((data as TokenRow).refresh_expires_at)
    && nullableString((data as TokenRow).refresh_hard_expires_at);
}

function isPortalPaymentRow(data: unknown): data is TokenRow & {
  connection_id: string; realm_id: string; remote_invoice_id: string; granted_scopes: string[];
} {
  const grantedScopes = (data as { granted_scopes?: unknown } | null)?.granted_scopes;
  return isTokenRow(data) && typeof (data as { connection_id?: unknown }).connection_id === "string"
    && typeof (data as { realm_id?: unknown }).realm_id === "string"
    && typeof (data as { remote_invoice_id?: unknown }).remote_invoice_id === "string"
    && Array.isArray(grantedScopes) && grantedScopes.every((scope) => typeof scope === "string");
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
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    credentialVersion: data.credential_version,
    connectionId,
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
    refreshHardExpiresAt: data.refresh_hard_expires_at,
  };
}

export async function claimQboOAuth(stateHash: string, actorId: string, breweryId: string, redirectUri: string) {
  const { data, error } = await createAdminClient().rpc("claim_qbo_oauth", {
    p_state_hash: stateHash, p_actor: actorId, p_brewery: breweryId, p_redirect_uri: redirectUri,
  }).maybeSingle();
  if (error || !data) return null;
  const row = data as { intent_id: string; brewery_id: string; provider_intent: "connect" | "reconnect"; requested_scopes: unknown };
  if (!Array.isArray(row.requested_scopes) || row.requested_scopes.some((scope) => typeof scope !== "string")) return null;
  return {
    intentId: row.intent_id, breweryId: row.brewery_id,
    providerIntent: row.provider_intent, requestedScopes: row.requested_scopes,
  };
}

export async function completeQboOAuthStore(intentId: string, actorId: string, realmId: string, tokens: import("@/lib/qbo").QboTokens) {
  const { data, error } = await createAdminClient().rpc("complete_qbo_oauth", {
    p_intent: intentId, p_actor: actorId, p_realm_id: realmId, p_realm_label: realmId,
    p_access_token: tokens.accessToken, p_refresh_token: tokens.refreshToken,
    p_received_at: tokens.receivedAt,
    p_access_seconds: tokens.accessExpiresIn, p_refresh_seconds: tokens.refreshExpiresIn, p_hard_seconds: tokens.refreshHardExpiresIn,
    p_granted_scopes: tokens.grantedScopes,
  });
  if (error || typeof data !== "string") throw new Error("QuickBooks connection storage failed");
  return data;
}

export async function failQboOAuth(intentId: string, actorId: string) {
  const { error } = await createAdminClient().rpc("fail_qbo_oauth", { p_intent: intentId, p_actor: actorId });
  if (error) throw new Error("QuickBooks recovery state could not be recorded");
}

export async function claimSquareOAuth(stateHash: string, actorId: string, breweryId: string, redirectUri: string) {
  const { data, error } = await createAdminClient().rpc("claim_square_oauth", {
    p_state_hash: stateHash, p_actor: actorId, p_brewery: breweryId, p_redirect_uri: redirectUri,
  }).maybeSingle();
  if (error || !data) return null;
  const row = data as { intent_id: string; brewery_id: string; provider_intent: "connect" | "reconnect"; requested_scopes: unknown };
  if (!Array.isArray(row.requested_scopes) || row.requested_scopes.some((scope) => typeof scope !== "string")) return null;
  return { intentId: row.intent_id, breweryId: row.brewery_id, providerIntent: row.provider_intent, requestedScopes: row.requested_scopes };
}

export async function completeSquareOAuthStore(
  intentId: string,
  actorId: string,
  tokens: import("@/lib/pos").SquareTokens,
  locations: import("@/lib/pos").SquareLocation[],
) {
  const { data, error } = await createAdminClient().rpc("complete_square_oauth", {
    p_intent: intentId, p_actor: actorId, p_merchant_id: tokens.merchantId, p_merchant_label: tokens.merchantId,
    p_access_token: tokens.accessToken, p_refresh_token: tokens.refreshToken, p_access_expires_at: tokens.accessExpiresAt,
    p_granted_scopes: ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"], p_locations: locations,
  });
  if (error || typeof data !== "string") throw new Error("Square connection storage failed");
  return data;
}

export async function failSquareOAuth(
  intentId: string,
  actorId: string,
  cleanupState: "not_required" | "pending" | "confirmed" | "unresolved",
  merchantId: string | null,
) {
  const { data, error } = await createAdminClient().rpc("fail_square_oauth", {
    p_intent: intentId, p_actor: actorId, p_cleanup_state: cleanupState, p_merchant_id: merchantId,
  });
  if (error || data !== true) throw new Error("Square recovery state could not be recorded");
}

export async function compareAndSwapSquareTokens(
  ctx: Ctx,
  expected: VersionedIntegrationTokens,
  next: import("@/lib/pos").SquareTokens,
  accessExpiresIn: number,
) {
  const { data, error } = await createAdminClient().rpc("cas_integration_tokens", {
    p_brewery: ctx.breweryId, p_provider: "square", p_connection: expected.connectionId, p_actor: ctx.userId,
    p_expected_version: expected.credentialVersion, p_access_token: next.accessToken, p_refresh_token: next.refreshToken,
    p_received_at: next.receivedAt, p_access_seconds: accessExpiresIn, p_refresh_seconds: null, p_hard_seconds: null,
  });
  if (error) throw new Error("Square token refresh storage failed");
  if (data !== true) throw new CommandError("Square connection changed; retry with the current connection", 409, "conflict");
}

export async function beginSquareCatalogSync(ctx: Ctx, requestId: string) {
  const { data, error } = await ctx.db.rpc("begin_square_catalog_sync", {
    p_brewery: ctx.breweryId, p_request_id: requestId,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square catalog sync could not be started");
  const row = data as Record<string, unknown> | null;
  if (row?.replayResult && typeof row.replayResult === "object") {
    return { replayResult: row.replayResult as { locations: number; variations: number } } as const;
  }
  if (typeof row?.actorId !== "string" || typeof row.connectionId !== "string" || typeof row.merchantId !== "string"
    || typeof row.credentialVersion !== "number" || typeof row.catalogGeneration !== "number" || typeof row.requestId !== "string") {
    throw new Error("Square catalog sync start was invalid");
  }
  return row as SquareCatalogSyncStart;
}

export async function advanceSquareCatalogSync(
  ctx: Ctx,
  start: SquareCatalogSyncStart,
  nextCredentialVersion: number,
) {
  const { data, error } = await createAdminClient().rpc("advance_square_catalog_sync", {
    p_brewery: ctx.breweryId, p_connection: start.connectionId, p_actor: start.actorId, p_request_id: start.requestId,
    p_expected_version: start.credentialVersion, p_next_version: nextCredentialVersion,
  });
  if (error || data !== true) throw new CommandError("Square connection changed", 409, "conflict");
  return { ...start, credentialVersion: nextCredentialVersion };
}

export async function markSquareAuthorizationFailed(ctx: Ctx, connectionId: string, expectedCredentialVersion: number) {
  const { error } = await createAdminClient().rpc("mark_square_authorization_failed", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_expected_version: expectedCredentialVersion,
  });
  if (error) throw new Error("Square authorization health could not be updated");
}

export async function recordSquareCatalogSnapshot(
  ctx: Ctx,
  expected: SquareCatalogSyncStart,
  facts: { locations: import("@/lib/pos").SquareLocation[]; variations: import("@/lib/pos").SquareVariation[] },
) {
  const { data, error } = await createAdminClient().rpc("record_square_catalog_snapshot", {
    p_brewery: ctx.breweryId, p_connection: expected.connectionId, p_actor: expected.actorId,
    p_expected_version: expected.credentialVersion, p_request_id: expected.requestId,
    p_locations: facts.locations, p_variations: facts.variations,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square catalog snapshot storage failed");
  return data as { locations: number; variations: number };
}

function squareSalesStart(data: unknown): SquareSalesSyncStart {
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.actorId !== "string" || typeof row.requestId !== "string"
    || typeof row.connectionId !== "string" || typeof row.merchantId !== "string"
    || typeof row.credentialVersion !== "number" || typeof row.startsAt !== "string" || typeof row.endsAt !== "string"
    || typeof row.locationsCaptured !== "boolean" || !Array.isArray(row.locationIds)
    || row.locationIds.some((id) => typeof id !== "string") || typeof row.locationOffset !== "number"
    || (row.cursor !== null && typeof row.cursor !== "string") || typeof row.pages !== "number") {
    throw new Error("Square sales sync start was invalid");
  }
  return row as SquareSalesSyncStart;
}

export async function beginSquareSalesSync(ctx: Ctx, requestId: string) {
  const { data, error } = await ctx.db.rpc("begin_square_sales_sync", { p_brewery: ctx.breweryId, p_request_id: requestId });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error?.message === "Square connection required") throw new CommandError(error.message, 404, "not_found");
  if (error) throw new Error("Square sales sync could not be started");
  const row = data as Record<string, unknown> | null;
  if (row?.replayResult && typeof row.replayResult === "object") return { replayResult: row.replayResult as SquareSalesSyncResult } as const;
  return squareSalesStart(data);
}

export async function advanceSquareSalesSync(ctx: Ctx, start: SquareSalesSyncStart, nextCredentialVersion: number) {
  const { data, error } = await createAdminClient().rpc("advance_square_sales_sync", {
    p_brewery: ctx.breweryId, p_connection: start.connectionId, p_actor: start.actorId, p_request_id: start.requestId,
    p_expected_version: start.credentialVersion, p_next_version: nextCredentialVersion,
  });
  if (error || data !== true) throw new CommandError("Square connection changed", 409, "conflict");
  return { ...start, credentialVersion: nextCredentialVersion };
}

export async function recordSquareSalesLocations(ctx: Ctx, start: SquareSalesSyncStart, locations: import("@/lib/pos").SquareLocation[]) {
  const { data, error } = await createAdminClient().rpc("record_square_sales_locations", {
    p_brewery: ctx.breweryId, p_connection: start.connectionId, p_actor: start.actorId, p_request_id: start.requestId,
    p_expected_version: start.credentialVersion, p_locations: locations,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square sales locations could not be stored");
  const row = data as Record<string, unknown> | null;
  if (!row || !Array.isArray(row.locationIds) || row.locationIds.some((id) => typeof id !== "string")
    || typeof row.locationOffset !== "number" || (row.cursor !== null && typeof row.cursor !== "string")
    || typeof row.pages !== "number") throw new Error("Square sales location snapshot was invalid");
  return { ...start, locationsCaptured: true, locationIds: row.locationIds as string[],
    locationOffset: row.locationOffset, cursor: row.cursor as string | null, pages: row.pages };
}

export async function recordSquareSalesPage(
  ctx: Ctx,
  start: SquareSalesSyncStart,
  page: { locationIds: string[]; cursor: string | null; nextCursor: string | null;
    orders: import("@/lib/pos").SquareOrderSnapshot[]; facts: import("@/lib/pos").SquareSalesFact[] },
): Promise<SquareSalesSyncStart | SquareSalesSyncResult> {
  const { data, error } = await createAdminClient().rpc("record_square_sales_page", {
    p_brewery: ctx.breweryId, p_connection: start.connectionId, p_actor: start.actorId, p_request_id: start.requestId,
    p_expected_version: start.credentialVersion, p_location_ids: page.locationIds, p_cursor: page.cursor,
    p_next_cursor: page.nextCursor, p_orders: page.orders, p_facts: page.facts,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square sales page could not be stored");
  const row = data as Record<string, unknown> | null;
  if (row?.complete === true) return row as SquareSalesSyncResult;
  if (!row || row.complete !== false || !Array.isArray(row.locationIds) || typeof row.locationOffset !== "number"
    || (row.cursor !== null && typeof row.cursor !== "string") || typeof row.pages !== "number") {
    throw new Error("Square sales continuation was invalid");
  }
  return { ...start, locationIds: row.locationIds as string[], locationOffset: row.locationOffset,
    cursor: row.cursor as string | null, pages: row.pages };
}

function squarePublicationStart(data: unknown): SquarePublicationStart {
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.attemptId !== "string" || typeof row.connectionId !== "string"
    || typeof row.credentialVersion !== "number" || typeof row.catalogGeneration !== "number" || typeof row.providerKey !== "string"
    || !["needs_snapshot", "prepared", "succeeded", "rejected", "superseded"].includes(String(row.status))
    || !row.source || typeof row.source !== "object"
    || (row.errorCode !== null && typeof row.errorCode !== "string")
    || (row.result !== null && typeof row.result !== "object")) {
    throw new Error("Square publication start was invalid");
  }
  return row as SquarePublicationStart;
}

export async function beginSquarePublication(
  ctx: Ctx,
  input: { posLocationId: string; brandId: string; adoptItemId?: string; adoptVariationId?: string;
    retryConflict?: boolean; menuPublicationId?: string },
  requestId: string,
  commandName: "publish_pos_menu" | "publish_pos_item",
) {
  const { data, error } = await ctx.db.rpc("begin_square_publication", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId, p_brand: input.brandId,
    p_adopt_item: input.adoptItemId ?? null, p_adopt_variation: input.adoptVariationId ?? null,
    p_retry_conflict: input.retryConflict ?? false, p_command: commandName, p_request_id: requestId,
    p_menu_publication: input.menuPublicationId ?? null,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error?.code === "42501") throw new CommandError("permission denied", 403, "permission_denied");
  if (error) throw new CommandError(error.message);
  return squarePublicationStart(data);
}

function squareMenuPublicationStart(data: unknown): SquareMenuPublicationStart {
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.menuAttemptId !== "string" || typeof row.connectionId !== "string"
    || typeof row.credentialVersion !== "number" || typeof row.catalogGeneration !== "number"
    || !["publishing", "succeeded", "superseded"].includes(String(row.status)) || !Array.isArray(row.manifest)
    || row.manifest.some((entry) => !entry || typeof entry !== "object"
      || typeof (entry as Record<string, unknown>).brandId !== "string"
      || typeof (entry as Record<string, unknown>).requestId !== "string")
    || (row.result !== null && typeof row.result !== "object")) {
    throw new Error("Square menu publication start was invalid");
  }
  return row as SquareMenuPublicationStart;
}

export async function beginSquareMenuPublication(
  ctx: Ctx, input: { posLocationId: string; retryConflict?: boolean }, requestId: string,
) {
  const { data, error } = await ctx.db.rpc("begin_square_menu_publication", {
    p_brewery: ctx.breweryId, p_external_location: input.posLocationId,
    p_retry_conflict: input.retryConflict ?? false, p_request_id: requestId,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error?.code === "42501") throw new CommandError("permission denied", 403, "permission_denied");
  if (error) throw new CommandError(error.message);
  return squareMenuPublicationStart(data);
}

export async function finishSquareMenuPublication(ctx: Ctx, menuAttemptId: string) {
  const { data, error } = await createAdminClient().rpc("finish_square_menu_publication", {
    p_brewery: ctx.breweryId, p_publication: menuAttemptId, p_actor: ctx.userId,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square menu publication result could not be recorded");
  return data as NonNullable<SquareMenuPublicationStart["result"]>;
}

export async function leaseSquarePublication(ctx: Ctx, attemptId: string) {
  const { data, error } = await createAdminClient().rpc("lease_square_publication", {
    p_brewery: ctx.breweryId, p_publication: attemptId, p_actor: ctx.userId,
  }).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (row?.superseded === true) throw new CommandError("Square publication was superseded", 409, "conflict");
  if (error || !row || typeof row.access_token !== "string"
    || (row.request_body !== null && typeof row.request_body !== "string")) {
    throw new CommandError("Square publication access is no longer available", 403, "permission_denied");
  }
  return { accessToken: row.access_token, requestBody: row.request_body as string | null };
}

export async function prepareSquarePublication(
  ctx: Ctx, attemptId: string, requestBody: string, itemVersion: number | null, variationVersions: Record<string, number>,
) {
  const { data, error } = await createAdminClient().rpc("prepare_square_publication", {
    p_brewery: ctx.breweryId, p_publication: attemptId, p_actor: ctx.userId,
    p_request_body: requestBody, p_item_version: itemVersion, p_variation_versions: variationVersions,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (data === false) throw new CommandError("Square publication was superseded", 409, "conflict");
  if (error || data !== true) throw new Error("Square publication could not be prepared");
}

export async function finishSquarePublication(
  ctx: Ctx, attemptId: string, errorCode: "version_mismatch" | "provider_rejected" | "provider_missing" | "provider_invalid" | null,
  response: { catalogObject: Record<string, unknown>; idMappings: Record<string, unknown>[] } | null,
) {
  const { data, error } = await createAdminClient().rpc("finish_square_publication", {
    p_brewery: ctx.breweryId, p_publication: attemptId, p_actor: ctx.userId,
    p_error_code: errorCode, p_response: response,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square publication result could not be recorded");
  return data as NonNullable<SquarePublicationStart["result"]>;
}

export async function getSquareHealth(ctx: Ctx) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const { data, error } = await ctx.db.from("pos_connections")
    .select("id,merchant_id,merchant_label,state,remote_revocation_state,last_error,access_expires_at")
    .eq("brewery_id", ctx.breweryId).eq("provider", "square").maybeSingle();
  if (error) throw new Error("Square health is unavailable");
  if (!data) return { connected: false, state: "disconnected" as const, merchantId: null, merchantLabel: null, lastError: null };
  return {
    connected: data.state === "connected", connectionId: data.id as string,
    state: data.state as "connected" | "disconnected" | "recovery_required",
    merchantId: data.merchant_id as string | null, merchantLabel: data.merchant_label as string | null,
    remoteRevocationState: data.remote_revocation_state as "not_requested" | "pending" | "confirmed" | "unresolved",
    lastError: data.last_error as string | null, accessExpiresAt: data.access_expires_at as string | null,
  };
}

export async function disconnectSquare(ctx: Ctx, connectionId: string, revoke: (token: string) => Promise<void>, requestId: string) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_square_disconnect", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_request_id: requestId,
  }).maybeSingle();
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("Square disconnect failed");
  const row = data as { access_token?: unknown; replay_result?: unknown } | null;
  if (row?.replay_result && typeof row.replay_result === "object") {
    return row.replay_result as { disconnected: true; remoteRevocationState: "confirmed" | "unresolved" };
  }
  const token = typeof row?.access_token === "string" ? row.access_token : null;
  let revoked = false;
  if (token) revoked = await revoke(token).then(() => true, () => false);
  const { data: finished, error: finishError } = await admin.rpc("finish_square_disconnect", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_request_id: requestId, p_revoked: revoked,
  });
  if (finishError || !finished || typeof finished !== "object") throw new Error("Square disconnect reconciliation failed");
  return finished as { disconnected: true; remoteRevocationState: "confirmed" | "unresolved" };
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
  requireIntegrationRole(ctx);
  const { data, error } = await ctx.db.from("qbo_connections")
    .select("id,realm_id,realm_label,state,remote_revocation_state,last_error,access_expires_at,refresh_expires_at,refresh_hard_expires_at,qbo_deposit_item_id,allow_online_ach_payment,allow_online_credit_card_payment")
    .eq("brewery_id", ctx.breweryId).maybeSingle();
  if (error) throw new Error("QuickBooks health is unavailable");
  if (!data) return { connected: false, state: "disconnected" as const, realmLabel: null, lastError: null };
  return {
    connected: data.state === "connected", connectionId: data.id as string,
    state: data.state as "connected" | "disconnected" | "recovery_required", realmId: data.realm_id as string,
    realmLabel: data.realm_label as string | null, remoteRevocationState: data.remote_revocation_state as string,
    lastError: data.last_error as string | null, accessExpiresAt: data.access_expires_at as string | null,
    refreshExpiresAt: data.refresh_expires_at as string | null, refreshHardExpiresAt: data.refresh_hard_expires_at as string | null,
    depositItemId: data.qbo_deposit_item_id as string | null,
    allowAch: data.allow_online_ach_payment as boolean,
    allowCard: data.allow_online_credit_card_payment as boolean,
  };
}

export async function disconnectQbo(ctx: Ctx, connectionId: string, revoke: (token: string) => Promise<void>, requestId: string) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_qbo_disconnect", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_request_id: requestId,
  }).maybeSingle();
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("QuickBooks disconnect failed");
  const row = data as { refresh_token?: unknown; replay_result?: unknown } | null;
  if (row?.replay_result && typeof row.replay_result === "object") {
    return row.replay_result as { disconnected: true; remoteRevocationState: "confirmed" | "unresolved" };
  }
  const token = typeof row?.refresh_token === "string" ? row.refresh_token : null;
  let revoked = false;
  if (token) revoked = await revoke(token).then(() => true, () => false);
  const { data: finished, error: finishError } = await admin.rpc("finish_qbo_disconnect", {
    p_brewery: ctx.breweryId, p_connection: connectionId, p_actor: ctx.userId, p_request_id: requestId, p_revoked: revoked,
  });
  if (finishError || !finished || typeof finished !== "object") throw new Error("QuickBooks disconnect reconciliation failed");
  return finished as { disconnected: true; remoteRevocationState: "confirmed" | "unresolved" };
}

export async function finishQboPush(ctx: Ctx, input: {
  pushId: string;
  finishRequestId: string;
  status: "pushed" | "push_failed";
  remoteId: string | null;
  error: string | null;
  response: Record<string, unknown>;
}) {
  const { data, error } = await createAdminClient().rpc("finish_qbo_push", {
    p_brewery: ctx.breweryId, p_push: input.pushId, p_actor: ctx.userId,
    p_status: input.status, p_qbo_entity_id: input.remoteId, p_error: input.error,
    p_response: input.response, p_request_id: input.finishRequestId,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("QuickBooks push reconciliation failed");
  return data as { pushId: string; status: "pushed" | "push_failed"; remoteId: string | null };
}

export type QboInvoiceSyncResult = {
  synced: number;
  paid: number;
  voided: number;
  deleted: number;
  drifted: number;
};

export type QboInvoiceSyncTarget = {
  invoiceId: string;
  remoteId: string;
  pushId: string;
  requestBody: string;
  pushedResponse: Record<string, unknown> | null;
};

export type QboInvoiceObservation = {
  invoiceId: string;
  remoteId: string;
  remoteState: "live" | "voided" | "deleted";
  syncToken: string | null;
  taxCents: number | null;
  totalCents: number | null;
  balanceCents: number | null;
  contentMatches: boolean;
  cashCollectedCents: number;
  paidAt: string | null;
};

export async function beginQboInvoiceSync(ctx: Ctx, requestId: string) {
  const { data, error } = await ctx.db.rpc("begin_qbo_invoice_sync", {
    p_brewery: ctx.breweryId, p_request_id: requestId,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("QuickBooks invoice sync could not be started");
  const row = data as {
    actorId?: unknown;
    connectionId?: unknown;
    realmId?: unknown;
    targets?: unknown;
    replayResult?: unknown;
  } | null;
  if (row?.replayResult && typeof row.replayResult === "object") {
    return { replayResult: row.replayResult as QboInvoiceSyncResult } as const;
  }
  if (typeof row?.actorId !== "string" || typeof row.connectionId !== "string"
    || typeof row.realmId !== "string" || !Array.isArray(row.targets)) {
    throw new Error("QuickBooks invoice sync start was invalid");
  }
  return {
    actorId: row.actorId,
    connectionId: row.connectionId,
    realmId: row.realmId,
    targets: row.targets as QboInvoiceSyncTarget[],
  } as const;
}

export async function completeQboInvoiceSync(ctx: Ctx, input: {
  actorId: string;
  connectionId: string;
  realmId: string;
  requestId: string;
  observations: QboInvoiceObservation[];
}) {
  const { data, error } = await createAdminClient().rpc("complete_qbo_invoice_sync", {
    p_brewery: ctx.breweryId, p_actor: input.actorId, p_request_id: input.requestId,
    p_connection: input.connectionId, p_realm: input.realmId, p_observations: input.observations,
  });
  if (error?.code === "MG409") throw new CommandError(error.message, 409, "conflict");
  if (error) throw new Error("QuickBooks invoice sync could not be recorded");
  return data as QboInvoiceSyncResult;
}

export async function readPortalQuoteTax(ctx: Ctx, quoteId: string) {
  if (!ctx.customerId) throw new CommandError("not a portal customer", 403);
  const { data, error } = await createAdminClient().rpc("read_portal_quote_tax", {
    p_brewery: ctx.breweryId, p_customer: ctx.customerId, p_quote: quoteId, p_actor: ctx.userId,
  }).maybeSingle();
  const row = data as { connection_id?: unknown; access_token?: unknown; tax_input?: unknown } | null;
  if (error || typeof row?.connection_id !== "string" || typeof row.access_token !== "string"
    || !row.tax_input || typeof row.tax_input !== "object") return null;
  return { connectionId: row.connection_id, accessToken: row.access_token, input: row.tax_input as import("@/lib/qbo").QboTaxInput };
}

export async function finishPortalQuoteTax(ctx: Ctx, quoteId: string, connectionId: string, taxCents: number) {
  if (!ctx.customerId) throw new CommandError("not a portal customer", 403);
  const { data, error } = await createAdminClient().rpc("finish_portal_quote_tax", {
    p_brewery: ctx.breweryId, p_customer: ctx.customerId, p_quote: quoteId, p_actor: ctx.userId,
    p_connection: connectionId, p_tax_cents: taxCents,
  });
  if (error || !data || typeof data !== "object") throw new Error("QuickBooks tax calculation unavailable");
  return data as Record<string, unknown>;
}

export async function readPortalInvoicePayment(ctx: Ctx, invoiceId: string): Promise<PortalInvoicePaymentClaim | null> {
  if (ctx.role !== "customer" || !ctx.customerId || !isUuid(invoiceId)) {
    throw new CommandError("invoice not found", 404, "not_found");
  }
  const visible = await ctx.db.from("invoices").select("id").eq("id", invoiceId)
    .eq("brewery_id", ctx.breweryId).eq("customer_id", ctx.customerId).maybeSingle();
  if (visible.error) throw new Error("invoice payment is unavailable");
  if (!visible.data) throw new CommandError("invoice not found", 404, "not_found");
  const { data, error } = await createAdminClient().rpc("read_portal_qbo_payment", {
    p_brewery: ctx.breweryId, p_customer: ctx.customerId, p_invoice: invoiceId, p_actor: ctx.userId,
  }).maybeSingle();
  if (error || !isPortalPaymentRow(data)) return null;
  return {
    accessToken: data.access_token, refreshToken: data.refresh_token,
    credentialVersion: data.credential_version, connectionId: data.connection_id,
    realmId: data.realm_id, remoteInvoiceId: data.remote_invoice_id, grantedScopes: data.granted_scopes,
    accessExpiresAt: data.access_expires_at, refreshExpiresAt: data.refresh_expires_at,
    refreshHardExpiresAt: data.refresh_hard_expires_at,
  };
}

export async function compareAndSwapPortalInvoicePaymentTokens(
  ctx: Ctx,
  invoiceId: string,
  expected: PortalInvoicePaymentClaim,
  next: import("@/lib/qbo").QboTokens,
) {
  if (!ctx.customerId) return false;
  const { data, error } = await createAdminClient().rpc("cas_portal_qbo_payment_tokens", {
    p_brewery: ctx.breweryId, p_customer: ctx.customerId, p_invoice: invoiceId, p_actor: ctx.userId,
    p_connection: expected.connectionId, p_realm_id: expected.realmId,
    p_remote_invoice_id: expected.remoteInvoiceId, p_granted_scopes: expected.grantedScopes,
    p_expected_version: expected.credentialVersion, p_access_token: next.accessToken, p_refresh_token: next.refreshToken,
    p_received_at: next.receivedAt, p_access_seconds: next.accessExpiresIn,
    p_refresh_seconds: next.refreshExpiresIn, p_hard_seconds: next.refreshHardExpiresIn,
  });
  return !error && data === true;
}

export async function confirmPortalInvoicePayment(ctx: Ctx, invoiceId: string, claim: PortalInvoicePaymentClaim) {
  if (!ctx.customerId) return false;
  const { data, error } = await createAdminClient().rpc("confirm_portal_qbo_payment", {
    p_brewery: ctx.breweryId, p_customer: ctx.customerId, p_invoice: invoiceId, p_actor: ctx.userId,
    p_connection: claim.connectionId, p_realm_id: claim.realmId,
    p_remote_invoice_id: claim.remoteInvoiceId, p_expected_version: claim.credentialVersion,
    p_granted_scopes: claim.grantedScopes,
  });
  return !error && data === true;
}
