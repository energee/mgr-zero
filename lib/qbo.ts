import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import { compareAndSwapQboTokens, finishQboPush, readVersionedIntegrationTokens } from "@/lib/supabase/integration-tokens";
import { readQboEnv } from "@/lib/env/server-parser";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const ACCOUNTING_MINOR_VERSION = "75";
export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";

export type QboConfig = { clientId: string; clientSecret: string; redirectUri: string; apiBaseUrl: string };
export type QboTokens = {
  accessToken: string;
  refreshToken: string;
  receivedAt: string;
  accessExpiresIn: number;
  refreshExpiresIn: number | null;
  refreshHardExpiresIn: number | null;
};

export type QboOAuthClaim = { intentId: string; breweryId: string; providerIntent: "connect" | "reconnect" };
export type QboOAuthStore = {
  claim(stateHash: string, actorId: string, selectedBreweryId: string, redirectUri: string): Promise<QboOAuthClaim | null>;
  complete(intentId: string, actorId: string, realmId: string, tokens: QboTokens): Promise<string>;
  fail(intentId: string, actorId: string): Promise<void>;
};

type QboPushStart = {
  pushId?: string;
  providerRequestId?: string;
  finishRequestId?: string;
  requestBody?: string;
  entityType?: "Invoice" | "CreditMemo";
  realmId?: string;
  connectionId?: string;
  status: "pending" | "pushed";
  remoteId?: string;
  alreadyPushed?: boolean;
};

function positiveSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function parseTokens(value: unknown, receivedAt: string): QboTokens {
  if (!value || typeof value !== "object") throw new Error("QuickBooks token response was invalid");
  const row = value as Record<string, unknown>;
  if (typeof row.access_token !== "string" || !row.access_token || typeof row.refresh_token !== "string" || !row.refresh_token) {
    throw new Error("QuickBooks token response was invalid");
  }
  const accessExpiresIn = positiveSeconds(row.expires_in);
  if (accessExpiresIn === null) throw new Error("QuickBooks token response was invalid");
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    receivedAt,
    accessExpiresIn,
    refreshExpiresIn: positiveSeconds(row.x_refresh_token_expires_in),
    refreshHardExpiresIn: positiveSeconds(row.x_refresh_token_hard_expires_in),
  };
}

export function sanitizeQboError(error: unknown) {
  void error;
  return "QuickBooks is unavailable";
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function beginQboOAuth(ctx: Ctx, client: QboOAuthClient, providerIntent: "connect" | "reconnect", requestId: string = randomUUID()) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const state = sha256(`${requestId}:${ctx.userId}`);
  await unwrap(ctx.db.rpc("begin_qbo_oauth", {
    p_brewery: ctx.breweryId, p_redirect_uri: client.redirectUri, p_state_hash: sha256(state),
    p_provider_intent: providerIntent, p_request_id: requestId,
  }));
  return { authorizeUrl: client.authorizeUrl(state) };
}

export async function refreshQboTokens(ctx: Ctx, client: QboOAuthClient) {
  const current = await readVersionedIntegrationTokens(ctx, "qbo");
  const next = await client.refresh(current.refreshToken).catch((error) => { throw new Error(sanitizeQboError(error)); });
  await compareAndSwapQboTokens(ctx, current, next);
  return next.accessToken;
}

export async function completeQboOAuth(input: {
  request: Request;
  actorId: string;
  selectedBreweryId: string;
  redirectUri: string;
  client: QboOAuthClient;
  store: QboOAuthStore;
}) {
  const params = new URL(input.request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  const realmId = params.get("realmId");
  if (!state || !code || !realmId || params.get("error")) throw new Error("oauth state invalid");
  const claim = await input.store.claim(sha256(state), input.actorId, input.selectedBreweryId, input.redirectUri);
  if (!claim || claim.breweryId !== input.selectedBreweryId) throw new Error("oauth state invalid");
  try {
    const tokens = await input.client.exchange(code);
    await input.client.verifyRealm(realmId, tokens.accessToken);
    return await input.store.complete(claim.intentId, input.actorId, realmId, tokens);
  } catch (error) {
    await input.store.fail(claim.intentId, input.actorId);
    throw new Error(sanitizeQboError(error));
  }
}

export async function pushInvoiceToQbo(
  ctx: Ctx,
  invoiceId: string,
  requestId: string,
  client: QboOAuthClient,
  newAttemptReason?: "corrected" | "remote_deleted",
) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("permission denied: QuickBooks push requires admin or sales", 403, "permission_denied");
  }
  const start = await unwrap(ctx.db.rpc("start_qbo_push", {
    p_brewery: ctx.breweryId, p_invoice: invoiceId,
    p_new_attempt_reason: newAttemptReason ?? null, p_request_id: requestId,
  })) as QboPushStart;
  if (start.alreadyPushed) return { status: "pushed" as const, remoteId: start.remoteId };
  if (!start.pushId || !start.providerRequestId || !start.finishRequestId || !start.requestBody
    || !start.entityType || !start.realmId || !start.connectionId) {
    throw new Error("QuickBooks push start was invalid");
  }
  const tokens = await readVersionedIntegrationTokens(ctx, "qbo");
  if (tokens.connectionId !== start.connectionId) {
    throw new CommandError("QuickBooks connection changed; retry with the current connection", 409, "conflict");
  }
  let created: Awaited<ReturnType<QboOAuthClient["createTransaction"]>>;
  try {
    created = await client.createTransaction(start.realmId, start.entityType, start.providerRequestId, start.requestBody, tokens.accessToken);
  } catch (error) {
    throw new Error(sanitizeQboError(error));
  }
  if (!created.ok) {
    if (created.definitive) {
      await finishQboPush(ctx, {
        pushId: start.pushId, finishRequestId: start.finishRequestId, status: "push_failed",
        remoteId: null, error: "QuickBooks rejected the invoice", response: { httpStatus: created.status },
      });
      throw new CommandError("QuickBooks rejected the invoice; fix the mapping and choose corrected", 400);
    }
    throw new Error("QuickBooks is unavailable");
  }
  return finishQboPush(ctx, {
    pushId: start.pushId, finishRequestId: start.finishRequestId, status: "pushed",
    remoteId: created.remoteId, error: null, response: created.response,
  });
}

export class QboOAuthClient {
  constructor(private readonly config: QboConfig, private readonly transport: typeof globalThis.fetch = globalThis.fetch) {}

  get redirectUri() { return this.config.redirectUri; }

  authorizeUrl(state: string) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", QBO_ACCOUNTING_SCOPE);
    url.searchParams.set("state", state);
    return url.toString();
  }

  exchange(code: string) {
    return this.token(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: this.config.redirectUri }));
  }

  refresh(refreshToken: string) {
    return this.token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
  }

  async verifyRealm(realmId: string, accessToken: string) {
    const escapedRealm = encodeURIComponent(realmId);
    const url = new URL(`/v3/company/${escapedRealm}/companyinfo/${escapedRealm}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.transport(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) throw new Error("QuickBooks company verification failed");
    const body = await response.json() as { CompanyInfo?: { Id?: unknown } };
    if (typeof body.CompanyInfo?.Id !== "string" || !body.CompanyInfo.Id.trim()) {
      throw new Error("QuickBooks company verification failed");
    }
  }

  async revoke(token: string) {
    const response = await this.transport(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: this.basic(), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      redirect: "error",
    });
    if (!response.ok) throw new Error("QuickBooks revoke failed");
  }

  async createTransaction(realmId: string, entityType: "Invoice" | "CreditMemo", requestId: string, body: string, accessToken: string) {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/${entityType.toLowerCase()}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    url.searchParams.set("requestid", requestId);
    const response = await this.transport(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      body,
      redirect: "error",
    });
    if (!response.ok) return { ok: false as const, definitive: response.status === 400 || response.status === 422, status: response.status };
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("QuickBooks response was invalid");
    const entity = (payload as Record<string, unknown>)[entityType];
    if (!entity || typeof entity !== "object" || typeof (entity as Record<string, unknown>).Id !== "string"
      || !(entity as Record<string, unknown>).Id) throw new Error("QuickBooks response was invalid");
    const row = entity as Record<string, unknown>;
    const safe = Object.fromEntries(["Id", "SyncToken", "TotalAmt", "Balance"]
      .filter((key) => typeof row[key] === "string" || (typeof row[key] === "number" && Number.isFinite(row[key])) )
      .map((key) => [key, row[key]]));
    const tax = row.TxnTaxDetail;
    if (tax && typeof tax === "object" && typeof (tax as Record<string, unknown>).TotalTax === "number"
      && Number.isFinite((tax as Record<string, unknown>).TotalTax)) {
      safe.TotalTax = (tax as Record<string, unknown>).TotalTax;
    }
    return { ok: true as const, remoteId: row.Id as string, response: safe };
  }

  private basic() {
    return `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`;
  }

  private async token(body: URLSearchParams) {
    const response = await this.transport(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: this.basic(), Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-include-refresh-token-hard-expires-in": "true",
      },
      body,
      redirect: "error",
    });
    const receivedAt = new Date().toISOString();
    if (!response.ok) throw new Error("QuickBooks token request failed");
    return parseTokens(await response.json(), receivedAt);
  }
}

export function qboConfig(env: Record<string, string | undefined> = process.env): QboConfig {
  try { return readQboEnv(env); } catch { throw new Error("QuickBooks setup is unavailable"); }
}
