import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import { readSquareEnv } from "@/lib/env/server-parser";
import {
  advanceSquareCatalogSync,
  advanceSquareSalesSync,
  beginSquareCatalogSync,
  beginSquareMenuPublication,
  beginSquarePublication,
  beginSquareSalesSync,
  compareAndSwapSquareTokens,
  finishSquareMenuPublication,
  finishSquarePublication,
  leaseSquarePublication,
  markSquareAuthorizationFailed,
  prepareSquarePublication,
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

export type SquarePublicationSource = {
  brandId: string;
  brand: string;
  catalogGroup: "poured";
  locationId: string;
  ownership: "mgr" | "adopted";
  externalItemId: string | null;
  variations: Array<{
    formatId: string;
    format: string;
    priceCents: number | null;
    present: boolean;
    externalVariationId: string | null;
  }>;
};

const READ_ONLY_CATALOG_FIELDS = new Set(["updated_at", "is_deleted", "sold_out", "sold_out_valid_until"]);

function writableCatalogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(writableCatalogValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !READ_ONLY_CATALOG_FIELDS.has(key))
    .map(([key, child]) => [key, writableCatalogValue(child)]));
}

function locationPresent(object: Record<string, unknown>, locationId: string) {
  const ids = (object.present_at_all_locations === false ? object.present_at_location_ids : object.absent_at_location_ids) as unknown;
  return object.present_at_all_locations === false
    ? Array.isArray(ids) && ids.includes(locationId)
    : !(Array.isArray(ids) && ids.includes(locationId));
}

function setLocationPresence(object: Record<string, unknown>, locationId: string, present: boolean) {
  const all = object.present_at_all_locations !== false;
  const key = all ? "absent_at_location_ids" : "present_at_location_ids";
  const current = Array.isArray(object[key]) ? object[key].filter((id): id is string => typeof id === "string") : [];
  const shouldContain = all ? !present : present;
  object[key] = shouldContain ? [...new Set([...current, locationId])] : current.filter((id) => id !== locationId);
}

export function prepareSquareCatalogPublication(source: SquarePublicationSource, current?: Record<string, unknown> | null) {
  const publishable = source.variations.filter((variation) => variation.present && variation.priceCents !== null);
  if (!source.externalItemId) {
    if (publishable.length === 0) throw new Error("A new Square item must have a priced available variation");
    const itemId = `#mgr-item-${source.brandId}-${source.catalogGroup}`;
    return { object: {
      type: "ITEM", id: itemId, present_at_all_locations: false, present_at_location_ids: [source.locationId],
      item_data: { name: source.brand, product_type: "REGULAR", variations: publishable.map((variation) => ({
        type: "ITEM_VARIATION", id: `#mgr-variation-${variation.formatId}`, present_at_all_locations: false,
        present_at_location_ids: [source.locationId], item_variation_data: {
          item_id: itemId, name: variation.format, pricing_type: "FIXED_PRICING",
          price_money: { amount: variation.priceCents, currency: "USD" },
        },
      })) },
    }, itemVersion: null, variationVersions: { versions: {} as Record<string, number>, changed: [] as string[] } };
  }
  if (!current || current.type !== "ITEM" || current.id !== source.externalItemId || current.is_deleted === true
    || !Number.isSafeInteger(current.version)) throw new Error("Square catalog item changed or is unavailable");
  const currentItemData = current.item_data as Record<string, unknown> | undefined;
  const currentVariations = currentItemData?.variations;
  if (!Array.isArray(currentVariations)) throw new Error("Square catalog item has no writable variations");
  const item = writableCatalogValue(current) as Record<string, unknown>;
  const itemData = item.item_data as Record<string, unknown> | undefined;
  const variations = itemData?.variations;
  if (!itemData || !Array.isArray(variations)) throw new Error("Square catalog item has no writable variations");
  const changed: Record<string, unknown>[] = [];
  const variationVersions: Record<string, number> = {};
  const changedVariationIds: string[] = [];
  const ownedIds = new Set(source.variations.flatMap((variation) => variation.externalVariationId ? [variation.externalVariationId] : []));
  for (const sourceVariation of source.variations) {
    if (!sourceVariation.externalVariationId) {
      if (!sourceVariation.present || sourceVariation.priceCents === null) continue;
      const variation = { type: "ITEM_VARIATION", id: `#mgr-variation-${sourceVariation.formatId}`,
        present_at_all_locations: false, present_at_location_ids: [source.locationId], item_variation_data: {
          item_id: source.externalItemId, name: sourceVariation.format, pricing_type: "FIXED_PRICING",
          price_money: { amount: sourceVariation.priceCents, currency: "USD" },
        } };
      variations.push(variation); changed.push(variation); continue;
    }
    const original = currentVariations.find((entry) => !!entry && typeof entry === "object"
      && (entry as Record<string, unknown>).id === sourceVariation.externalVariationId) as Record<string, unknown> | undefined;
    const variation = variations.find((entry) => !!entry && typeof entry === "object"
      && (entry as Record<string, unknown>).id === sourceVariation.externalVariationId) as Record<string, unknown> | undefined;
    if (!original || !variation || original.type !== "ITEM_VARIATION" || original.is_deleted === true
      || !Number.isSafeInteger(original.version)) throw new Error("Square catalog variation changed or is unavailable");
    const before = JSON.stringify(writableCatalogValue(original));
    const variationData = variation.item_variation_data as Record<string, unknown> | undefined;
    if (!variationData || variationData.item_id !== source.externalItemId) throw new Error("Square catalog ownership changed");
    variationVersions[sourceVariation.externalVariationId] = original.version as number;
    variationData.name = sourceVariation.format;
    if (sourceVariation.present && sourceVariation.priceCents !== null) {
      const overrides = Array.isArray(variationData.location_overrides)
        ? variationData.location_overrides.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object") : [];
      const at = overrides.findIndex((entry) => entry.location_id === source.locationId);
      const next = { ...(at < 0 ? { location_id: source.locationId } : overrides[at]),
        pricing_type: "FIXED_PRICING", price_money: { amount: sourceVariation.priceCents, currency: "USD" } };
      if (at < 0) overrides.push(next); else overrides[at] = next;
      variationData.location_overrides = overrides;
    }
    setLocationPresence(variation, source.locationId, sourceVariation.present);
    if (JSON.stringify(variation) !== before) changedVariationIds.push(sourceVariation.externalVariationId);
    changed.push(variation);
  }
  const anyPresent = source.variations.some((variation) => variation.present && variation.priceCents !== null);
  const unrelatedPresent = variations.some((variation) => !!variation && typeof variation === "object"
    && typeof (variation as Record<string, unknown>).id === "string"
    && !ownedIds.has((variation as Record<string, unknown>).id as string)
    && locationPresent(variation as Record<string, unknown>, source.locationId));
  const parentNeedsLocation = anyPresent && !locationPresent(item, source.locationId);
  const parentNeedsRemoval = !anyPresent && source.ownership === "mgr" && !unrelatedPresent && locationPresent(item, source.locationId);
  const parentNeedsName = anyPresent && source.ownership === "mgr" && itemData.name !== source.brand;
  if (parentNeedsLocation || parentNeedsRemoval) setLocationPresence(item, source.locationId, parentNeedsLocation);
  if (parentNeedsName) itemData.name = source.brand;
  return {
    object: changed.length === 1 && !String(changed[0].id).startsWith("#")
      && !parentNeedsLocation && !parentNeedsRemoval && !parentNeedsName ? changed[0] : item,
    itemVersion: current.version as number,
    variationVersions: { versions: variationVersions, changed: changedVariationIds },
  };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new Error("Square is unavailable");
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const finiteVersion = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

class SquareProviderError extends Error {
  constructor(readonly terminalAuthorization: boolean) { super("Square is unavailable"); }
}

class SquareCatalogReadError extends Error {
  constructor(readonly code: "provider_missing" | "provider_invalid") { super("Square catalog item is unavailable"); }
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

export function isSquareConfigured(env: Record<string, string | undefined> = process.env) {
  try { readSquareEnv(env); return true; } catch { return false; }
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
      if (data.objects !== undefined && !Array.isArray(data.objects)) throw unavailable();
      objects.push(...(data.objects ?? []).filter((value): value is Record<string, unknown> => !!value && typeof value === "object"));
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
    if (data.orders !== undefined && !Array.isArray(data.orders)) throw unavailable();
    const nextCursor = data.cursor === undefined ? null : text(data.cursor);
    if (data.cursor !== undefined && !nextCursor) throw unavailable();
    return { orders: data.orders ?? [], nextCursor };
  }

  async retrieveCatalogObject(accessToken: string, objectId: string) {
    const response = await this.fetcher(`${this.apiOrigin}/v2/catalog/object/${encodeURIComponent(objectId)}?include_related_objects=false`, {
      headers: { "Square-Version": SQUARE_VERSION, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      if (terminalAuthorization(response.status, data)) throw new SquareProviderError(true);
      if (response.status === 404 || Array.isArray(data?.errors) && data.errors.some((entry) => !!entry
        && typeof entry === "object" && (entry as Record<string, unknown>).code === "NOT_FOUND")) {
        throw new SquareCatalogReadError("provider_missing");
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        throw new SquareCatalogReadError("provider_invalid");
      }
      throw unavailable();
    }
    if (!data?.object || typeof data.object !== "object") throw new SquareCatalogReadError("provider_invalid");
    return data.object as Record<string, unknown>;
  }

  async upsertCatalogObject(accessToken: string, requestBody: string) {
    const response = await this.fetcher(`${this.apiOrigin}/v2/catalog/object`, {
      method: "POST",
      headers: { "Square-Version": SQUARE_VERSION, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: requestBody,
    });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      if (terminalAuthorization(response.status, data)) throw new SquareProviderError(true);
      const versionConflict = Array.isArray(data?.errors) && data.errors.some((entry) =>
        !!entry && typeof entry === "object" && (entry as Record<string, unknown>).code === "VERSION_MISMATCH");
      return { ok: false as const, versionConflict, definitive: versionConflict || (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) };
    }
    if (!data?.catalog_object || typeof data.catalog_object !== "object" || !Array.isArray(data.id_mappings ?? [])) throw unavailable();
    return { ok: true as const, catalogObject: data.catalog_object as Record<string, unknown>,
      idMappings: (data.id_mappings ?? []) as Record<string, unknown>[] };
  }
}

export async function publishSquareCatalogItem(
  ctx: Ctx,
  input: { posLocationId: string; brandId: string; adoptItemId?: string; adoptVariationId?: string;
    retryConflict?: boolean; menuPublicationId?: string },
  requestId: string,
  client: SquareClient,
  commandName: "publish_pos_menu" | "publish_pos_item",
) {
  const start = await beginSquarePublication(ctx, input, requestId, commandName);
  if (start.status === "succeeded") return start.result!;
  if (start.status === "rejected") {
    throw new CommandError(start.errorCode === "version_mismatch"
      ? "Square changed this item; retry after loading its current version" : "Square rejected this publication", 409, "conflict");
  }
  if (start.status === "superseded") throw new CommandError("Square publication was superseded by newer connection data", 409, "conflict");
  const leaseOrFinished = async () => {
    try { return { lease: await leaseSquarePublication(ctx, start.attemptId) }; }
    catch (error) {
      const replay = await beginSquarePublication(ctx, input, requestId, commandName);
      if (replay.status === "succeeded") return { result: replay.result! };
      if (replay.status === "rejected") throw new CommandError(replay.errorCode === "version_mismatch"
        ? "Square changed this item; retry after loading its current version" : "Square rejected this publication", 409, "conflict");
      if (replay.status === "superseded") throw new CommandError("Square publication was superseded by newer connection data", 409, "conflict");
      throw error;
    }
  };
  let acquired = await leaseOrFinished();
  if ("result" in acquired) return acquired.result;
  let lease = acquired.lease;
  if (lease.accessExpiresAt && Date.parse(lease.accessExpiresAt) <= Date.now()) {
    let next: SquareTokens;
    try { next = await client.refresh(lease.refreshToken); }
    catch (error) {
      if (isTerminalAuthorization(error)) {
        await markSquareAuthorizationFailed(ctx, start.connectionId, lease.credentialVersion);
      }
      throw unavailable();
    }
    if (next.merchantId !== lease.merchantId) throw unavailable();
    await compareAndSwapSquareTokens(ctx, {
      accessToken: lease.accessToken, refreshToken: lease.refreshToken, connectionId: start.connectionId,
      credentialVersion: lease.credentialVersion, accessExpiresAt: lease.accessExpiresAt,
      refreshExpiresAt: null, refreshHardExpiresAt: null,
    }, next, secondsUntil(next.receivedAt, next.accessExpiresAt));
    throw new CommandError("Square publication was superseded by refreshed credentials", 409, "conflict");
  }
  if (!lease.requestBody) {
    let current: Record<string, unknown> | null = null;
    try {
      current = start.source.externalItemId
        ? await client.retrieveCatalogObject(lease.accessToken, start.source.externalItemId) : null;
    } catch (error) {
      if (isTerminalAuthorization(error)) {
        await markSquareAuthorizationFailed(ctx, start.connectionId, lease.credentialVersion);
        throw unavailable();
      }
      if (error instanceof SquareCatalogReadError) {
        await finishSquarePublication(ctx, start.attemptId, error.code, null);
        throw new CommandError("Square no longer has the selected catalog item", 409, "conflict");
      }
      throw unavailable();
    }
    let prepared: ReturnType<typeof prepareSquareCatalogPublication>;
    try { prepared = prepareSquareCatalogPublication(start.source, current); }
    catch (error) {
      const code = error instanceof Error && /changed or is unavailable/.test(error.message) ? "provider_missing" : "provider_invalid";
      await finishSquarePublication(ctx, start.attemptId, code, null);
      throw new CommandError("Square no longer has the selected catalog item", 409, "conflict");
    }
    await prepareSquarePublication(ctx, start.attemptId, JSON.stringify({
      idempotency_key: start.providerKey,
      object: prepared.object,
    }), prepared.itemVersion, prepared.variationVersions);
    acquired = await leaseOrFinished();
    if ("result" in acquired) return acquired.result;
    lease = acquired.lease;
  }
  let result: Awaited<ReturnType<SquareClient["upsertCatalogObject"]>>;
  try { result = await client.upsertCatalogObject(lease.accessToken, lease.requestBody!); }
  catch (error) {
    if (isTerminalAuthorization(error)) {
      await markSquareAuthorizationFailed(ctx, start.connectionId, lease.credentialVersion);
    }
    throw unavailable();
  }
  if (!result.ok) {
    if (result.definitive) await finishSquarePublication(ctx, start.attemptId,
      result.versionConflict ? "version_mismatch" : "provider_rejected", null);
    if (result.versionConflict) throw new CommandError("Square changed this item; retry after loading its current version", 409, "conflict");
    throw result.definitive ? new CommandError("Square rejected this publication", 400) : unavailable();
  }
  return finishSquarePublication(ctx, start.attemptId, null, {
    catalogObject: result.catalogObject,
    idMappings: result.idMappings,
  });
}

export async function publishSquareMenu(
  ctx: Ctx, input: { posLocationId: string; retryConflict?: boolean }, requestId: string, client: SquareClient,
) {
  const reject = (result: { errorCode?: string }) => {
    if (result.errorCode === "version_mismatch") {
      throw new CommandError("Square changed a menu item; retry after loading its current version", 409, "conflict");
    }
    throw new CommandError("Square rejected this menu publication",
      result.errorCode === "provider_rejected" ? 400 : 409, "conflict");
  };
  const start = await beginSquareMenuPublication(ctx, input, requestId);
  if (start.status === "succeeded") return start.result!;
  if (start.status === "rejected") return reject(start.result!);
  if (start.status === "superseded") {
    throw new CommandError("Square menu publication was superseded by newer connection data", 409, "conflict");
  }
  try {
    for (const item of start.manifest) await publishSquareCatalogItem(ctx, {
      posLocationId: input.posLocationId, brandId: item.brandId, retryConflict: input.retryConflict,
      menuPublicationId: start.menuAttemptId,
    }, item.requestId, client, "publish_pos_menu");
  } catch (error) {
    if (error instanceof CommandError) {
      const settled = await finishSquareMenuPublication(ctx, start.menuAttemptId);
      if (settled.rejected) return reject(settled);
    }
    throw error;
  }
  return finishSquareMenuPublication(ctx, start.menuAttemptId);
}

type PublicationCommandResult = {
  publication: { attemptId: string; status: "succeeded" | "rejected" | "superseded"; errorCode: string | null };
  result: Record<string, unknown> | null;
};

function itemCommandResult(start: Awaited<ReturnType<typeof beginSquarePublication>>): PublicationCommandResult | null {
  if (start.status !== "succeeded" && start.status !== "rejected" && start.status !== "superseded") return null;
  return { publication: { attemptId: start.attemptId, status: start.status, errorCode: start.errorCode }, result: start.result };
}

function menuCommandResult(start: Awaited<ReturnType<typeof beginSquareMenuPublication>>): PublicationCommandResult | null {
  if (start.status !== "succeeded" && start.status !== "rejected" && start.status !== "superseded") return null;
  return { publication: { attemptId: start.menuAttemptId, status: start.status, errorCode: start.errorCode }, result: start.result };
}

/** The HTTP command contract includes durable terminal state; transient throws remain retryable under the same request ID. */
export async function publishSquareCatalogItemCommand(
  ctx: Ctx,
  input: Parameters<typeof publishSquareCatalogItem>[1],
  requestId: string,
  client: SquareClient,
) {
  try {
    await publishSquareCatalogItem(ctx, input, requestId, client, "publish_pos_item");
  } catch (error) {
    try {
      const terminal = itemCommandResult(await beginSquarePublication(ctx, input, requestId, "publish_pos_item"));
      if (terminal) return terminal;
    } catch { /* No durable attempt means the original command failure remains authoritative. */ }
    throw error;
  }
  const terminal = itemCommandResult(await beginSquarePublication(ctx, input, requestId, "publish_pos_item"));
  if (!terminal) throw new Error("Square publication terminal state was unavailable");
  return terminal;
}

/** Menu publication has the same terminal envelope as item publication. */
export async function publishSquareMenuCommand(
  ctx: Ctx,
  input: Parameters<typeof publishSquareMenu>[1],
  requestId: string,
  client: SquareClient,
) {
  try {
    await publishSquareMenu(ctx, input, requestId, client);
  } catch (error) {
    try {
      const terminal = menuCommandResult(await beginSquareMenuPublication(ctx, input, requestId));
      if (terminal) return terminal;
    } catch { /* No durable attempt means the original command failure remains authoritative. */ }
    throw error;
  }
  const terminal = menuCommandResult(await beginSquareMenuPublication(ctx, input, requestId));
  if (!terminal) throw new Error("Square menu publication terminal state was unavailable");
  return terminal;
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
