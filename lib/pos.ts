import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import { readSquareEnv } from "@/lib/env/server-parser";
import {
  advanceSquareCatalogSync,
  advanceSquareSalesSync,
  beginSquareCatalogSync,
  beginSquareSalesSync,
  compareAndSwapSquareTokens,
  markSquareAuthorizationFailed,
  readVersionedIntegrationTokens,
  recordSquareCatalogSnapshot,
  recordSquareSalesLocations,
  recordSquareSalesPage,
  type SquareCatalogSyncStart,
  type VersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";

export const SQUARE_VERSION = "2026-08-19";
export const SQUARE_SCOPES = ["ITEMS_READ", "ITEMS_WRITE", "MERCHANT_PROFILE_READ", "ORDERS_READ"] as const;

export type SquareConfig = {
  applicationId: string;
  applicationSecret: string;
  redirectUri: string;
  environment: "sandbox" | "production";
};
export type SquareTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  merchantId: string;
  receivedAt: string;
};
export type SquareLocation = { id: string; name: string; status: string };
export type SquareVariation = {
  itemId: string;
  itemName: string | null;
  variationId: string;
  variationName: string | null;
  version: number;
  available: boolean;
};
export type SquareOrderSnapshot = {
  externalOrderId: string;
  sourceVersion: number;
  externalLocationId: string;
  soldAt: string;
  orderUpdatedAt: string;
};
export type SquareSalesFact = SquareOrderSnapshot & {
  externalLineId: string;
  factKind: "sale" | "return";
  factStatus: "accepted" | "unsupported";
  sourceQuantity: string | null;
  qty: string | null;
  grossCents: string | null;
  externalVariationId: string | null;
  catalogVersion: number | null;
  quantityUnit: Record<string, unknown> | null;
  sourceOrderId: string | null;
  sourceLineId: string | null;
  unsupportedReason: string | null;
  sourceHash: string;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new Error("Square is unavailable");
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const finiteVersion = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

class SquareProviderError extends Error {
  constructor(readonly terminalAuthorization: boolean) { super("Square is unavailable"); }
}

const terminalAuthorization = (status: number, data: unknown) => {
  if (status === 401 || status === 403) return true;
  const row = data && typeof data === "object" ? data as Record<string, unknown> : null;
  if (row?.type === "invalid_grant") return true;
  return Array.isArray(row?.errors) && row.errors.some((value) => {
    const error = value && typeof value === "object" ? value as Record<string, unknown> : null;
    return error?.category === "AUTHENTICATION_ERROR" || error?.code === "UNAUTHORIZED" || error?.code === "ACCESS_TOKEN_EXPIRED";
  });
};

const isTerminalAuthorization = (error: unknown): error is SquareProviderError =>
  error instanceof SquareProviderError && error.terminalAuthorization;

export function squareConfig(): SquareConfig {
  return readSquareEnv();
}

export class SquareClient {
  private readonly oauthOrigin: string;
  private readonly apiOrigin: string;

  constructor(readonly config: SquareConfig, private readonly fetcher: typeof fetch = fetch) {
    this.oauthOrigin = config.environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
    this.apiOrigin = config.environment === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  }

  authorizeUrl(state: string) {
    const url = new URL("/oauth2/authorize", this.oauthOrigin);
    url.searchParams.set("client_id", this.config.applicationId);
    url.searchParams.set("scope", SQUARE_SCOPES.join(" "));
    url.searchParams.set("state", state);
    if (this.config.environment === "production") url.searchParams.set("session", "false");
    return url.href;
  }

  private async token(body: Record<string, unknown>): Promise<SquareTokens> {
    const receivedAt = new Date().toISOString();
    const response = await this.fetcher(`${this.oauthOrigin}/oauth2/token`, {
      method: "POST",
      headers: { "Square-Version": SQUARE_VERSION, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: this.config.applicationId, client_secret: this.config.applicationSecret, ...body }),
    });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    const accessToken = text(data?.access_token);
    const refreshToken = text(data?.refresh_token);
    const accessExpiresAt = text(data?.expires_at);
    const merchantId = text(data?.merchant_id);
    if (!response.ok) throw new SquareProviderError(terminalAuthorization(response.status, data));
    if (!accessToken || !refreshToken || !accessExpiresAt || !merchantId || !Number.isFinite(Date.parse(accessExpiresAt))) throw unavailable();
    return { accessToken, refreshToken, accessExpiresAt, merchantId, receivedAt };
  }

  exchange(code: string) {
    return this.token({ code, grant_type: "authorization_code" });
  }

  refresh(refreshToken: string) {
    return this.token({ refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  private async revokeToken(accessToken: string, revokeOnlyAccessToken: boolean) {
    const response = await this.fetcher(`${this.oauthOrigin}/oauth2/revoke`, {
      method: "POST",
      headers: { "Square-Version": SQUARE_VERSION, Authorization: `Client ${this.config.applicationSecret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: this.config.applicationId, access_token: accessToken, revoke_only_access_token: revokeOnlyAccessToken }),
    });
    const data = await response.json().catch(() => null) as { success?: unknown } | null;
    if (!response.ok || data?.success !== true) throw unavailable();
  }

  revoke(accessToken: string) { return this.revokeToken(accessToken, false); }

  revokeAccessToken(accessToken: string) { return this.revokeToken(accessToken, true); }

  private async api(path: string, accessToken: string, init?: RequestInit) {
    const response = await this.fetcher(`${this.apiOrigin}${path}`, {
      ...init,
      headers: { "Square-Version": SQUARE_VERSION, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new SquareProviderError(terminalAuthorization(response.status, data));
    if (!data || typeof data !== "object") throw unavailable();
    return data as Record<string, unknown>;
  }

  async listLocations(accessToken: string, merchantId: string): Promise<SquareLocation[]> {
    const data = await this.api("/v2/locations", accessToken);
    if (!Array.isArray(data.locations)) throw unavailable();
    return data.locations.map((raw) => {
      const row = raw as Record<string, unknown>;
      const id = text(row.id), name = text(row.name), status = text(row.status), owner = text(row.merchant_id);
      if (!id || !name || !status || owner !== merchantId) throw unavailable();
      return { id, name, status };
    });
  }

  async listCatalogVariations(accessToken: string): Promise<SquareVariation[]> {
    const objects: Record<string, unknown>[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const body = { object_types: ["ITEM", "ITEM_VARIATION"], include_deleted_objects: true, ...(cursor ? { cursor } : {}) };
      const data = await this.api("/v2/catalog/search", accessToken, { method: "POST", body: JSON.stringify(body) });
      if (!Array.isArray(data.objects)) throw unavailable();
      objects.push(...data.objects.filter((value): value is Record<string, unknown> => !!value && typeof value === "object"));
      cursor = data.cursor === undefined ? null : text(data.cursor);
      if (data.cursor !== undefined && !cursor) throw unavailable();
      if (cursor && cursors.has(cursor)) throw unavailable();
      if (cursor) cursors.add(cursor);
    } while (cursor);

    const itemNames = new Map<string, string>();
    const variations = new Map<string, SquareVariation>();
    const add = (raw: Record<string, unknown>, fallbackItemId?: string, fallbackItemName?: string) => {
      if (raw.type !== "ITEM_VARIATION") return;
      const data = raw.item_variation_data as Record<string, unknown> | undefined;
      const variationId = text(raw.id), itemId = text(data?.item_id) ?? fallbackItemId ?? null;
      const version = finiteVersion(raw.version);
      if (!variationId || !itemId || version === null) throw unavailable();
      const next = { itemId, itemName: fallbackItemName ?? null, variationId, variationName: text(data?.name), version, available: raw.is_deleted !== true };
      const current = variations.get(variationId);
      if (!current || next.version >= current.version) variations.set(variationId, next);
    };
    for (const raw of objects) {
      if (raw.type !== "ITEM") continue;
      const itemId = text(raw.id), data = raw.item_data as Record<string, unknown> | undefined, itemName = text(data?.name);
      if (!itemId) throw unavailable();
      if (itemName) itemNames.set(itemId, itemName);
      if (Array.isArray(data?.variations)) for (const variation of data.variations) {
        if (variation && typeof variation === "object") add(variation as Record<string, unknown>, itemId, itemName ?? undefined);
      }
    }
    for (const raw of objects) add(raw);
    return [...variations.values()].map((row) => ({ ...row, itemName: row.itemName ?? itemNames.get(row.itemId) ?? null }));
  }

  async searchOrdersPage(
    accessToken: string,
    locationIds: string[],
    window: { startsAt: string; endsAt: string },
    cursor: string | null,
  ) {
    const body = {
      location_ids: locationIds,
      query: {
        filter: {
          date_time_filter: { updated_at: { start_at: window.startsAt, end_at: window.endsAt } },
          state_filter: { states: ["COMPLETED"] },
        },
        sort: { sort_field: "UPDATED_AT", sort_order: "ASC" },
      },
      limit: 1000,
      return_entries: false,
      ...(cursor ? { cursor } : {}),
    };
    const data = await this.api("/v2/orders/search", accessToken, { method: "POST", body: JSON.stringify(body) });
    if (!Array.isArray(data.orders)) throw unavailable();
    const nextCursor = data.cursor === undefined ? null : text(data.cursor);
    if (data.cursor !== undefined && !nextCursor) throw unavailable();
    return { orders: data.orders, nextCursor };
  }
}

export async function syncSquareCatalogFacts(client: SquareClient, accessToken: string, merchantId: string) {
  const locations = await client.listLocations(accessToken, merchantId);
  const variations = await client.listCatalogVariations(accessToken);
  return { locations, variations };
}

export async function beginSquareOAuth(ctx: Ctx, client: SquareClient, providerIntent: "connect" | "reconnect", requestId: string = randomUUID()) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const state = sha256(`${requestId}:${ctx.userId}`);
  await unwrap(ctx.db.rpc("begin_square_oauth", {
    p_brewery: ctx.breweryId, p_redirect_uri: client.config.redirectUri, p_state_hash: sha256(state),
    p_provider_intent: providerIntent, p_request_id: requestId, p_requested_scopes: [...SQUARE_SCOPES],
  }));
  return { authorizeUrl: client.authorizeUrl(state) };
}

export async function completeSquareOAuth(input: {
  request: Request;
  actorId: string;
  selectedBreweryId: string;
  redirectUri: string;
  client: SquareClient;
  store: {
    claim(stateHash: string, actorId: string, breweryId: string, redirectUri: string): Promise<{ intentId: string; breweryId: string; providerIntent: "connect" | "reconnect"; requestedScopes: string[] } | null>;
    complete(intentId: string, actorId: string, tokens: SquareTokens, locations: SquareLocation[]): Promise<string>;
    fail(intentId: string, actorId: string, cleanupState: "not_required" | "pending" | "confirmed" | "unresolved",
      merchantId: string | null): Promise<void>;
  };
}) {
  const params = new URL(input.request.url).searchParams;
  const state = params.get("state"), code = params.get("code");
  if (!state || !code || params.get("error")) throw new Error("oauth state invalid");
  const claim = await input.store.claim(sha256(state), input.actorId, input.selectedBreweryId, input.redirectUri);
  if (!claim || claim.breweryId !== input.selectedBreweryId) throw new Error("oauth state invalid");
  let tokens: SquareTokens | null = null;
  try {
    tokens = await input.client.exchange(code);
    const locations = await input.client.listLocations(tokens.accessToken, tokens.merchantId);
    return await input.store.complete(claim.intentId, input.actorId, tokens, locations);
  } catch {
    if (!tokens) {
      await input.store.fail(claim.intentId, input.actorId, "not_required", null).catch(() => undefined);
    } else {
      try {
        await input.store.fail(claim.intentId, input.actorId, "pending", tokens.merchantId);
      } catch {
        await input.store.fail(claim.intentId, input.actorId, "unresolved", tokens.merchantId).catch(() => undefined);
        throw unavailable();
      }
      const cleanup = await input.client.revokeAccessToken(tokens.accessToken).then(() => "confirmed" as const, () => "unresolved" as const);
      await input.store.fail(claim.intentId, input.actorId, cleanup, tokens.merchantId).catch(() => undefined);
    }
    throw unavailable();
  }
}

const secondsUntil = (receivedAt: string, expiresAt: string) => Math.max(1, Math.ceil((Date.parse(expiresAt) - Date.parse(receivedAt)) / 1000));

async function refreshSquareCredentials(
  ctx: Ctx,
  client: SquareClient,
  expected?: VersionedIntegrationTokens,
  syncStart?: SquareCatalogSyncStart,
) {
  const current = expected ?? await readVersionedIntegrationTokens(ctx, "square");
  let next: SquareTokens;
  try {
    next = await client.refresh(current.refreshToken);
  } catch (error) {
    if (isTerminalAuthorization(error)) await markSquareAuthorizationFailed(ctx, current.connectionId, current.credentialVersion);
    throw unavailable();
  }
  if (next.merchantId !== (syncStart?.merchantId ?? await getSquareMerchant(ctx))) throw unavailable();
  try {
    await compareAndSwapSquareTokens(ctx, current, next, secondsUntil(next.receivedAt, next.accessExpiresAt));
  } catch (error) {
    if (syncStart || !(error instanceof CommandError) || error.status !== 409) throw unavailable();
  }
  const stored = await readVersionedIntegrationTokens(ctx, "square").catch(() => { throw unavailable(); });
  if (stored.connectionId !== current.connectionId || stored.credentialVersion <= current.credentialVersion) throw unavailable();
  if (!syncStart) return { tokens: stored };
  if (stored.credentialVersion !== current.credentialVersion + 1) throw unavailable();
  return { tokens: stored, syncStart: await advanceSquareCatalogSync(ctx, syncStart, stored.credentialVersion) };
}

async function getSquareMerchant(ctx: Ctx) {
  const { data, error } = await ctx.db.from("pos_connections").select("merchant_id").eq("brewery_id", ctx.breweryId).eq("provider", "square").eq("state", "connected").single();
  if (error || typeof data?.merchant_id !== "string") throw unavailable();
  return data.merchant_id;
}

export async function refreshSquareTokens(ctx: Ctx, client: SquareClient) {
  return (await refreshSquareCredentials(ctx, client)).tokens.accessToken;
}

export async function syncSquareCatalog(ctx: Ctx, requestId: string, client: SquareClient) {
  let start = await beginSquareCatalogSync(ctx, requestId);
  if ("replayResult" in start) return start.replayResult;
  let tokens = await readVersionedIntegrationTokens(ctx, "square");
  if (tokens.connectionId !== start.connectionId || tokens.credentialVersion !== start.credentialVersion) {
    throw new CommandError("Square connection changed", 409, "conflict");
  }
  if (tokens.accessExpiresAt && Date.parse(tokens.accessExpiresAt) <= Date.now()) {
    const refreshed = await refreshSquareCredentials(ctx, client, tokens, start);
    tokens = refreshed.tokens;
    start = refreshed.syncStart!;
  }
  let facts: Awaited<ReturnType<typeof syncSquareCatalogFacts>>;
  try {
    facts = await syncSquareCatalogFacts(client, tokens.accessToken, start.merchantId);
  } catch (error) {
    if (isTerminalAuthorization(error)) await markSquareAuthorizationFailed(ctx, start.connectionId, tokens.credentialVersion);
    throw unavailable();
  }
  return recordSquareCatalogSnapshot(ctx, start, facts);
}

const timestamp = (value: unknown) => {
  const result = text(value);
  return result && Number.isFinite(Date.parse(result)) ? new Date(result).toISOString() : null;
};

const money = (value: unknown) => {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : null;
  return row?.currency === "USD" && typeof row.amount === "number" && Number.isSafeInteger(row.amount)
    ? String(row.amount) : null;
};

function normalizeSquareOrders(
  rawOrders: unknown[], merchantId: string, locationIds: string[], window: { startsAt: string; endsAt: string },
) {
  const orders: SquareOrderSnapshot[] = [];
  const facts: SquareSalesFact[] = [];
  for (const raw of rawOrders) {
    const order = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
    const externalOrderId = text(order?.id), externalLocationId = text(order?.location_id);
    const sourceVersion = finiteVersion(order?.version), soldAt = timestamp(order?.created_at), orderUpdatedAt = timestamp(order?.updated_at);
    if (!externalOrderId || !externalLocationId || !locationIds.includes(externalLocationId) || sourceVersion === null
      || !soldAt || !orderUpdatedAt || order?.state !== "COMPLETED" || Date.parse(soldAt) > Date.parse(orderUpdatedAt)
      || Date.parse(orderUpdatedAt) < Date.parse(window.startsAt) || Date.parse(orderUpdatedAt) > Date.parse(window.endsAt)) throw unavailable();
    const snapshot = { externalOrderId, sourceVersion, externalLocationId, soldAt, orderUpdatedAt };
    orders.push(snapshot);
    const identities = new Set<string>();
    const add = (rawLine: unknown, factKind: "sale" | "return", sourceOrderId: string | null) => {
      const row = rawLine && typeof rawLine === "object" ? rawLine as Record<string, unknown> : null;
      const externalLineId = text(row?.uid);
      if (!externalLineId || identities.has(`${factKind}\0${externalLineId}`)) throw unavailable();
      identities.add(`${factKind}\0${externalLineId}`);
      const sourceQuantity = text(row?.quantity), externalVariationId = text(row?.catalog_object_id);
      const catalogVersion = finiteVersion(row?.catalog_version);
      const quantityUnit = row?.quantity_unit && typeof row.quantity_unit === "object"
        ? row.quantity_unit as Record<string, unknown> : null;
      const sourceLineId = factKind === "return" ? text(row?.source_line_item_uid) : null;
      let unsupportedReason: string | null = null;
      if (row?.item_type === "CUSTOM_AMOUNT") unsupportedReason = "custom_amount";
      else if (factKind === "return" && (!sourceOrderId || !sourceLineId)) unsupportedReason = "unlinked_return";
      else if (quantityUnit) unsupportedReason = "measured_quantity";
      else if (!sourceQuantity || !/^[1-9]\d*$/.test(sourceQuantity)) unsupportedReason = "unsupported_count_quantity";
      else if (!externalVariationId || catalogVersion === null) unsupportedReason = "missing_catalog_variation";
      const grossCents = money(row?.total_money);
      if (row?.total_money !== undefined && grossCents === null && !unsupportedReason) unsupportedReason = "unsupported_money";
      const fact = {
        ...snapshot,
        externalLineId,
        factKind,
        factStatus: unsupportedReason ? "unsupported" as const : "accepted" as const,
        sourceQuantity,
        qty: unsupportedReason ? null : sourceQuantity,
        grossCents,
        externalVariationId,
        catalogVersion,
        quantityUnit,
        sourceOrderId,
        sourceLineId,
        unsupportedReason,
      };
      facts.push({ ...fact, sourceHash: sha256(JSON.stringify({ merchantId, ...fact })) });
    };
    if (order.line_items !== undefined && !Array.isArray(order.line_items)) throw unavailable();
    for (const rawLine of order.line_items as unknown[] ?? []) add(rawLine, "sale", null);
    if (order.returns !== undefined && !Array.isArray(order.returns)) throw unavailable();
    for (const rawReturn of order.returns as unknown[] ?? []) {
      const returned = rawReturn && typeof rawReturn === "object" ? rawReturn as Record<string, unknown> : null;
      const sourceOrderId = text(returned?.source_order_id);
      if (returned?.return_line_items !== undefined && !Array.isArray(returned.return_line_items)) throw unavailable();
      for (const rawLine of returned?.return_line_items as unknown[] ?? []) add(rawLine, "return", sourceOrderId);
    }
  }
  return { orders, facts };
}

export async function syncSquareSales(ctx: Ctx, requestId: string, client: SquareClient) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  let start = await beginSquareSalesSync(ctx, requestId);
  if ("replayResult" in start) return start.replayResult;
  let tokens = await readVersionedIntegrationTokens(ctx, "square");
  if (tokens.connectionId !== start.connectionId || tokens.credentialVersion !== start.credentialVersion) {
    throw new CommandError("Square connection changed", 409, "conflict");
  }
  if (tokens.accessExpiresAt && Date.parse(tokens.accessExpiresAt) <= Date.now()) {
    const refreshed = await refreshSquareCredentials(ctx, client, tokens);
    tokens = refreshed.tokens;
    start = await advanceSquareSalesSync(ctx, start, tokens.credentialVersion);
  }
  if (!start.locationsCaptured) {
    let locations: SquareLocation[];
    try {
      locations = await client.listLocations(tokens.accessToken, start.merchantId);
    } catch (error) {
      if (isTerminalAuthorization(error)) await markSquareAuthorizationFailed(ctx, start.connectionId, tokens.credentialVersion);
      throw unavailable();
    }
    start = await recordSquareSalesLocations(ctx, start, locations);
  }
  for (;;) {
    const locationIds = start.locationIds.slice(start.locationOffset, start.locationOffset + 10);
    if (locationIds.length === 0) {
      return recordSquareSalesPage(ctx, start, { locationIds, cursor: start.cursor, nextCursor: null, orders: [], facts: [] });
    }
    let page: Awaited<ReturnType<SquareClient["searchOrdersPage"]>>;
    try {
      page = await client.searchOrdersPage(tokens.accessToken, locationIds, start, start.cursor);
    } catch (error) {
      if (isTerminalAuthorization(error)) await markSquareAuthorizationFailed(ctx, start.connectionId, tokens.credentialVersion);
      throw unavailable();
    }
    const normalized = normalizeSquareOrders(page.orders, start.merchantId, locationIds, start);
    const stored = await recordSquareSalesPage(ctx, start, {
      locationIds, cursor: start.cursor, nextCursor: page.nextCursor, ...normalized,
    });
    if ("complete" in stored) return stored;
    start = stored;
  }
}
