import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import { readSquareEnv } from "@/lib/env/server-parser";
import {
  compareAndSwapSquareTokens,
  readVersionedIntegrationTokens,
  recordSquareCatalogSnapshot,
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

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new Error("Square is unavailable");
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const finiteVersion = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

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
    if (!response.ok || !accessToken || !refreshToken || !accessExpiresAt || !merchantId || !Number.isFinite(Date.parse(accessExpiresAt))) throw unavailable();
    return { accessToken, refreshToken, accessExpiresAt, merchantId, receivedAt };
  }

  exchange(code: string) {
    return this.token({ code, grant_type: "authorization_code" });
  }

  refresh(refreshToken: string) {
    return this.token({ refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  async revoke(accessToken: string) {
    const response = await this.fetcher(`${this.oauthOrigin}/oauth2/revoke`, {
      method: "POST",
      headers: { "Square-Version": SQUARE_VERSION, Authorization: `Client ${this.config.applicationSecret}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: this.config.applicationId, access_token: accessToken, revoke_only_access_token: false }),
    });
    const data = await response.json().catch(() => null) as { success?: unknown } | null;
    if (!response.ok || data?.success !== true) throw unavailable();
  }

  private async api(path: string, accessToken: string, init?: RequestInit) {
    const response = await this.fetcher(`${this.apiOrigin}${path}`, {
      ...init,
      headers: { "Square-Version": SQUARE_VERSION, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== "object") throw unavailable();
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
    fail(intentId: string, actorId: string): Promise<void>;
  };
}) {
  const params = new URL(input.request.url).searchParams;
  const state = params.get("state"), code = params.get("code");
  if (!state || !code || params.get("error")) throw new Error("oauth state invalid");
  const claim = await input.store.claim(sha256(state), input.actorId, input.selectedBreweryId, input.redirectUri);
  if (!claim || claim.breweryId !== input.selectedBreweryId) throw new Error("oauth state invalid");
  try {
    const tokens = await input.client.exchange(code);
    const locations = await input.client.listLocations(tokens.accessToken, tokens.merchantId);
    return await input.store.complete(claim.intentId, input.actorId, tokens, locations);
  } catch {
    await input.store.fail(claim.intentId, input.actorId);
    throw unavailable();
  }
}

const secondsUntil = (receivedAt: string, expiresAt: string) => Math.max(1, Math.ceil((Date.parse(expiresAt) - Date.parse(receivedAt)) / 1000));

async function refreshSquareCredentials(ctx: Ctx, client: SquareClient, expected?: VersionedIntegrationTokens) {
  const current = expected ?? await readVersionedIntegrationTokens(ctx, "square");
  const next = await client.refresh(current.refreshToken).catch(() => { throw unavailable(); });
  if (next.merchantId !== (await getSquareMerchant(ctx))) throw unavailable();
  try {
    await compareAndSwapSquareTokens(ctx, current, next, secondsUntil(next.receivedAt, next.accessExpiresAt));
  } catch (error) {
    if (!(error instanceof CommandError) || error.status !== 409) throw unavailable();
  }
  const stored = await readVersionedIntegrationTokens(ctx, "square").catch(() => { throw unavailable(); });
  if (stored.connectionId !== current.connectionId || stored.credentialVersion <= current.credentialVersion) throw unavailable();
  return stored;
}

async function getSquareMerchant(ctx: Ctx) {
  const { data, error } = await ctx.db.from("pos_connections").select("merchant_id").eq("brewery_id", ctx.breweryId).eq("provider", "square").eq("state", "connected").single();
  if (error || typeof data?.merchant_id !== "string") throw unavailable();
  return data.merchant_id;
}

export async function refreshSquareTokens(ctx: Ctx, client: SquareClient) {
  return (await refreshSquareCredentials(ctx, client)).accessToken;
}

export async function syncSquareCatalog(ctx: Ctx, requestId: string, client: SquareClient) {
  let tokens = await readVersionedIntegrationTokens(ctx, "square");
  if (tokens.accessExpiresAt && Date.parse(tokens.accessExpiresAt) <= Date.now()) tokens = await refreshSquareCredentials(ctx, client, tokens);
  const facts = await syncSquareCatalogFacts(client, tokens.accessToken, await getSquareMerchant(ctx));
  return recordSquareCatalogSnapshot(ctx, tokens, requestId, facts);
}
