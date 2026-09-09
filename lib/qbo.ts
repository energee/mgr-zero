import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import {
  applyQboInvoiceState,
  compareAndSwapQboTokens,
  finishQboPush,
  readVersionedIntegrationTokens,
  type VersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";
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

type QboInvoiceRead = {
  ok: true;
  syncToken: string;
  taxCents: number;
  totalCents: number;
  balanceCents: number;
  cashPaid: boolean;
  paidAt: string | null;
  privateNote: string;
  content: string;
} | { ok: false; status: number; definitive: boolean };

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

function isPast(value: string | null) {
  return value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}

async function refreshQboCredentials(ctx: Ctx, client: QboOAuthClient, expected?: VersionedIntegrationTokens) {
  const current = expected ?? await readVersionedIntegrationTokens(ctx, "qbo");
  if (isPast(current.refreshExpiresAt) || isPast(current.refreshHardExpiresAt)) {
    throw new Error("QuickBooks is unavailable");
  }
  const next = await client.refresh(current.refreshToken).catch((error) => { throw new Error(sanitizeQboError(error)); });
  try {
    await compareAndSwapQboTokens(ctx, current, next);
  } catch (error) {
    if (!(error instanceof CommandError) || error.status !== 409) throw new Error(sanitizeQboError(error));
  }
  const stored = await readVersionedIntegrationTokens(ctx, "qbo")
    .catch((error) => { throw new Error(sanitizeQboError(error)); });
  if (stored.connectionId !== current.connectionId || stored.credentialVersion <= current.credentialVersion) {
    throw new Error("QuickBooks is unavailable");
  }
  return stored;
}

export async function refreshQboTokens(ctx: Ctx, client: QboOAuthClient) {
  return (await refreshQboCredentials(ctx, client)).accessToken;
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
  let tokens = await readVersionedIntegrationTokens(ctx, "qbo");
  if (tokens.connectionId !== start.connectionId) {
    throw new CommandError("QuickBooks connection changed; retry with the current connection", 409, "conflict");
  }
  let refreshed = false;
  if (isPast(tokens.accessExpiresAt)) {
    tokens = await refreshQboCredentials(ctx, client, tokens);
    refreshed = true;
  }
  let created: Awaited<ReturnType<QboOAuthClient["createTransaction"]>>;
  try {
    created = await client.createTransaction(start.realmId, start.entityType, start.providerRequestId, start.requestBody, tokens.accessToken);
  } catch (error) {
    throw new Error(sanitizeQboError(error));
  }
  if (!created.ok && created.status === 401 && !refreshed) {
    tokens = await refreshQboCredentials(ctx, client, tokens);
    if (tokens.connectionId !== start.connectionId) throw new Error("QuickBooks is unavailable");
    try {
      created = await client.createTransaction(start.realmId, start.entityType, start.providerRequestId, start.requestBody, tokens.accessToken);
    } catch (error) {
      throw new Error(sanitizeQboError(error));
    }
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

function derivedRequestId(requestId: string, invoiceId: string) {
  const hash = sha256(`${requestId}:${invoiceId}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

type QboSyncTarget = {
  id: string;
  qbo_invoice_id: string;
  qbo_pushes: {
    connection_id: string;
    realm_id: string;
    qbo_entity_id: string | null;
    request_body: string;
    response: Record<string, unknown> | null;
  }[];
};

export async function syncQboInvoices(ctx: Ctx, requestId: string, client: QboOAuthClient) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("permission denied: QuickBooks sync requires admin or sales", 403, "permission_denied");
  }
  const connection = await unwrap(ctx.db.from("qbo_connections").select("id,realm_id")
    .eq("brewery_id", ctx.breweryId).eq("state", "connected").single()) as { id: string; realm_id: string };
  let tokens = await readVersionedIntegrationTokens(ctx, "qbo");
  if (tokens.connectionId !== connection.id) throw new CommandError("QuickBooks connection changed", 409, "conflict");
  if (isPast(tokens.accessExpiresAt)) tokens = await refreshQboCredentials(ctx, client, tokens);

  const targets: QboSyncTarget[] = [];
  for (let start = 0; ; start += 500) {
    const page = await ctx.db.from("invoices")
      .select("id,qbo_invoice_id,qbo_pushes!inner(connection_id,realm_id,qbo_entity_id,request_body,response)", { count: "exact" })
      .eq("brewery_id", ctx.breweryId).eq("kind", "invoice").eq("qbo_sync_status", "pushed")
      .not("qbo_invoice_id", "is", null).eq("qbo_pushes.status", "pushed")
      .order("id").range(start, start + 499);
    const rows = await unwrap(Promise.resolve(page)) as unknown as QboSyncTarget[];
    targets.push(...rows);
    if (page.count === null || (!rows.length && targets.length < page.count)) throw new Error("QuickBooks invoice list was incomplete");
    if (targets.length >= page.count) break;
  }

  let synced = 0;
  let paid = 0;
  let voided = 0;
  let deleted = 0;
  let drifted = 0;
  for (const target of targets) {
    const push = target.qbo_pushes.find((row) => row.connection_id === connection.id
      && row.realm_id === connection.realm_id && row.qbo_entity_id === target.qbo_invoice_id);
    if (!push) continue;
    let read = await client.readInvoice(connection.realm_id, target.qbo_invoice_id, tokens.accessToken)
      .catch(() => { throw new Error("QuickBooks is unavailable"); });
    if (!read.ok && read.status === 401) {
      tokens = await refreshQboCredentials(ctx, client, tokens);
      if (tokens.connectionId !== connection.id) throw new Error("QuickBooks is unavailable");
      read = await client.readInvoice(connection.realm_id, target.qbo_invoice_id, tokens.accessToken)
        .catch(() => { throw new Error("QuickBooks is unavailable"); });
    }
    if (!read.ok && !read.definitive) throw new Error("QuickBooks is unavailable");
    const pushedTotal = typeof push.response?.TotalAmt === "number" ? Math.round(push.response.TotalAmt * 100) : null;
    const remoteState = read.ok && /^Voided\b/i.test(read.privateNote) && read.totalCents === 0
      && read.balanceCents === 0 && pushedTotal !== null && pushedTotal > 0 ? "voided" : read.ok ? "live" : "deleted";
    const result = await applyQboInvoiceState(ctx, {
      invoiceId: target.id, connectionId: connection.id, realmId: connection.realm_id,
      remoteId: target.qbo_invoice_id, remoteState,
      syncToken: read.ok ? read.syncToken : null,
      taxCents: read.ok ? read.taxCents : null,
      totalCents: read.ok ? read.totalCents : null,
      balanceCents: read.ok ? read.balanceCents : null,
      contentMatches: read.ok && read.content === meaningfulInvoiceContent(JSON.parse(push.request_body)),
      cashPaid: read.ok && read.cashPaid,
      paidAt: read.ok ? read.paidAt : null,
      requestId: derivedRequestId(requestId, target.id),
    });
    synced += 1;
    if (result.paid) paid += 1;
    if (result.remoteState === "voided") voided += 1;
    if (result.remoteState === "deleted") deleted += 1;
    if (result.drifted) drifted += 1;
  }
  return { synced, paid, voided, deleted, drifted };
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

  async readInvoice(realmId: string, remoteId: string, accessToken: string): Promise<QboInvoiceRead> {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/invoice/${encodeURIComponent(remoteId)}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.transport(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) return { ok: false, status: response.status, definitive: response.status === 404 };
    const payload = await response.json() as { Invoice?: Record<string, unknown> };
    const invoice = payload?.Invoice;
    const cents = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.round(value * 100) : null;
    const totalCents = cents(invoice?.TotalAmt);
    const balanceCents = cents(invoice?.Balance);
    const tax = invoice?.TxnTaxDetail;
    const taxCents = cents(tax && typeof tax === "object" ? (tax as Record<string, unknown>).TotalTax : 0);
    if (!invoice || invoice.Id !== remoteId || typeof invoice.SyncToken !== "string"
      || totalCents === null || balanceCents === null || taxCents === null) {
      throw new Error("QuickBooks response was invalid");
    }
    const linked = Array.isArray(invoice.LinkedTxn) ? invoice.LinkedTxn : [];
    const updated = invoice.MetaData && typeof invoice.MetaData === "object"
      ? (invoice.MetaData as Record<string, unknown>).LastUpdatedTime : null;
    return {
      ok: true, syncToken: invoice.SyncToken, totalCents, balanceCents, taxCents,
      cashPaid: linked.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).TxnType === "Payment"),
      paidAt: typeof updated === "string" && Number.isFinite(Date.parse(updated)) ? updated : null,
      privateNote: typeof invoice.PrivateNote === "string" ? invoice.PrivateNote : "",
      content: meaningfulInvoiceContent(invoice),
    };
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

function meaningfulInvoiceContent(invoice: Record<string, unknown>) {
  const ref = (value: unknown) => value && typeof value === "object" ? (value as Record<string, unknown>).value : undefined;
  const lines = Array.isArray(invoice.Line) ? invoice.Line : [];
  return JSON.stringify({
    customer: ref(invoice.CustomerRef), docNumber: invoice.DocNumber, txnDate: invoice.TxnDate,
    dueDate: invoice.DueDate, allowAch: invoice.AllowOnlineACHPayment,
    allowCard: invoice.AllowOnlineCreditCardPayment,
    lines: lines.filter((line) => line && typeof line === "object"
      && (line as Record<string, unknown>).DetailType === "SalesItemLineDetail").map((line) => {
      const row = line as Record<string, unknown>;
      const detail = row.SalesItemLineDetail as Record<string, unknown> | undefined;
      return {
        amount: row.Amount, description: row.Description, item: ref(detail?.ItemRef),
        qty: detail?.Qty, unitPrice: detail?.UnitPrice,
      };
    }),
  });
}

export function qboConfig(env: Record<string, string | undefined> = process.env): QboConfig {
  try { return readQboEnv(env); } catch { throw new Error("QuickBooks setup is unavailable"); }
}
