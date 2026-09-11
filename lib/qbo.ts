import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import {
  beginQboInvoiceSync,
  compareAndSwapPortalInvoicePaymentTokens,
  compareAndSwapQboTokens,
  completeQboInvoiceSync,
  confirmPortalInvoicePayment,
  finishQboPush,
  readPortalInvoicePayment,
  readVersionedIntegrationTokens,
  type QboInvoiceObservation,
  type PortalInvoicePaymentClaim,
  type VersionedIntegrationTokens,
} from "@/lib/supabase/integration-tokens";
import { readQboEnv } from "@/lib/env/server-parser";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const ACCOUNTING_MINOR_VERSION = "75";
const QBO_PAYMENT_HOSTS = new Set(["connect.intuit.com"]);
export const QBO_ACCOUNTING_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_TAX_SCOPE = "indirect-tax.tax-calculation.quickbooks";

export type QboConfig = { clientId: string; clientSecret: string; redirectUri: string; apiBaseUrl: string; taxApiBaseUrl?: string };
export type QboTaxInput = {
  transactionDate: string;
  customerId: string;
  sourceAddress: string;
  destinationAddress: string;
  lines: { itemId: string; qty: number; unitPriceCents: number }[];
};
export type QboTokens = {
  accessToken: string;
  refreshToken: string;
  receivedAt: string;
  accessExpiresIn: number;
  refreshExpiresIn: number | null;
  refreshHardExpiresIn: number | null;
  grantedScopes: string[] | null;
};

export type QboOAuthClaim = {
  intentId: string;
  breweryId: string;
  providerIntent: "connect" | "reconnect";
  requestedScopes: string[];
};
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
  status: "pending" | "pushed" | "push_failed";
  remoteId?: string;
  alreadyPushed?: boolean;
  alreadyFinished?: boolean;
  error?: string;
};

type QboInvoiceRead = {
  ok: true;
  syncToken: string;
  taxCents: number;
  totalCents: number;
  balanceCents: number;
  cashCollectedCents: number;
  paidAt: string | null;
  privateNote: string;
  content: Record<string, unknown>;
} | { ok: false; status: number; definitive: boolean };

type QboPaymentCashAllocations = ReadonlyMap<string, number>;
type QboPaymentCache = Map<string, Promise<QboPaymentCashAllocations>>;

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
    grantedScopes: typeof row.scope === "string" ? row.scope.split(/\s+/).filter(Boolean) : null,
  };
}

export function sanitizeQboError(error: unknown) {
  void error;
  return "QuickBooks is unavailable";
}

export function validateQboPaymentUrl(value: string, allowedHosts: ReadonlySet<string>) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && allowedHosts.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export type PortalInvoicePaymentResult =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; reason: "not_configured" | "provider_unavailable" | "link_unavailable" | "context_changed" };

async function refreshPortalInvoicePayment(
  ctx: Ctx,
  invoiceId: string,
  claim: PortalInvoicePaymentClaim,
  client: QboOAuthClient,
) {
  if (isPast(claim.refreshExpiresAt) || isPast(claim.refreshHardExpiresAt)) return null;
  const next = await client.refresh(claim.refreshToken).catch(() => null);
  if (!next || !await compareAndSwapPortalInvoicePaymentTokens(ctx, invoiceId, claim, next)) return null;
  return readPortalInvoicePayment(ctx, invoiceId);
}

export async function resolvePortalInvoicePayment(
  ctx: Ctx,
  invoiceId: string,
  client: QboOAuthClient,
  allowedHosts: ReadonlySet<string> = QBO_PAYMENT_HOSTS,
): Promise<PortalInvoicePaymentResult> {
  let claim = await readPortalInvoicePayment(ctx, invoiceId);
  if (!claim) return { kind: "unavailable", reason: "not_configured" };
  let refreshed = false;
  if (isPast(claim.accessExpiresAt)) {
    const next = await refreshPortalInvoicePayment(ctx, invoiceId, claim, client);
    if (!next) return { kind: "unavailable", reason: "provider_unavailable" };
    claim = next;
    refreshed = true;
  }
  let read = await client.readInvoiceLink(claim.realmId, claim.remoteInvoiceId, claim.accessToken).catch(() => null);
  if (read && !read.ok && read.status === 401 && !refreshed) {
    const next = await refreshPortalInvoicePayment(ctx, invoiceId, claim, client);
    if (!next) return { kind: "unavailable", reason: "provider_unavailable" };
    claim = next;
    read = await client.readInvoiceLink(claim.realmId, claim.remoteInvoiceId, claim.accessToken).catch(() => null);
  }
  if (!read || !read.ok) return { kind: "unavailable", reason: "provider_unavailable" };
  const url = read.invoiceLink ? validateQboPaymentUrl(read.invoiceLink, allowedHosts) : null;
  if (!url) return { kind: "unavailable", reason: "link_unavailable" };
  if (!await confirmPortalInvoicePayment(ctx, invoiceId, claim)) {
    return { kind: "unavailable", reason: "context_changed" };
  }
  return { kind: "redirect", url: url.href };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function beginQboOAuth(ctx: Ctx, client: QboOAuthClient, providerIntent: "connect" | "reconnect", requestId: string = randomUUID()) {
  if (ctx.role !== "admin") throw new CommandError("permission denied: brewery admin required", 403);
  const state = sha256(`${requestId}:${ctx.userId}`);
  await unwrap(ctx.db.rpc("begin_qbo_oauth", {
    p_brewery: ctx.breweryId, p_redirect_uri: client.redirectUri, p_state_hash: sha256(state),
    p_provider_intent: providerIntent, p_request_id: requestId, p_requested_scopes: client.requestedScopes,
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
    if (tokens.grantedScopes?.some((scope) => !claim.requestedScopes.includes(scope))) {
      throw new Error("QuickBooks token response was invalid");
    }
    await input.client.verifyRealm(realmId, tokens.accessToken);
    return await input.store.complete(claim.intentId, input.actorId, realmId, {
      ...tokens, grantedScopes: tokens.grantedScopes ?? [...claim.requestedScopes],
    });
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
  if (start.alreadyFinished && start.status === "pushed" && start.remoteId && start.pushId) {
    return { pushId: start.pushId, status: "pushed" as const, remoteId: start.remoteId };
  }
  if (start.alreadyPushed && start.status === "pushed" && start.remoteId) {
    return { status: "pushed" as const, remoteId: start.remoteId };
  }
  if (start.alreadyFinished && start.status === "push_failed") {
    throw new CommandError(start.error ?? "QuickBooks rejected the invoice; fix the mapping and choose corrected", 400);
  }
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

export async function syncQboInvoices(ctx: Ctx, requestId: string, client: QboOAuthClient) {
  if (ctx.role !== "admin" && ctx.role !== "sales") {
    throw new CommandError("permission denied: QuickBooks sync requires admin or sales", 403, "permission_denied");
  }
  const start = await beginQboInvoiceSync(ctx, requestId);
  if ("replayResult" in start) return start.replayResult;
  if (start.targets.length === 0) {
    return completeQboInvoiceSync(ctx, {
      actorId: start.actorId, connectionId: start.connectionId, realmId: start.realmId,
      requestId, observations: [],
    });
  }
  let tokens = await readVersionedIntegrationTokens(ctx, "qbo");
  if (tokens.connectionId !== start.connectionId) throw new CommandError("QuickBooks connection changed", 409, "conflict");
  if (isPast(tokens.accessExpiresAt)) tokens = await refreshQboCredentials(ctx, client, tokens);

  const observations: QboInvoiceObservation[] = [];
  const paymentCache: QboPaymentCache = new Map();
  for (const target of start.targets) {
    let read = await client.readInvoice(start.realmId, target.remoteId, tokens.accessToken, paymentCache)
      .catch(() => { throw new Error("QuickBooks is unavailable"); });
    if (!read.ok && read.status === 401) {
      tokens = await refreshQboCredentials(ctx, client, tokens);
      if (tokens.connectionId !== start.connectionId) throw new Error("QuickBooks is unavailable");
      read = await client.readInvoice(start.realmId, target.remoteId, tokens.accessToken, paymentCache)
        .catch(() => { throw new Error("QuickBooks is unavailable"); });
    }
    if (!read.ok && !read.definitive) throw new Error("QuickBooks is unavailable");
    const pushedTotal = typeof target.pushedResponse?.TotalAmt === "number"
      ? Math.round(target.pushedResponse.TotalAmt * 100) : null;
    const remoteState = read.ok && /^Voided\b/i.test(read.privateNote) && read.totalCents === 0
      && read.balanceCents === 0 && pushedTotal !== null && pushedTotal > 0 ? "voided" : read.ok ? "live" : "deleted";
    observations.push({
      invoiceId: target.invoiceId, remoteId: target.remoteId, remoteState,
      syncToken: read.ok ? read.syncToken : null,
      taxCents: read.ok ? read.taxCents : null,
      totalCents: read.ok ? read.totalCents : null,
      balanceCents: read.ok ? read.balanceCents : null,
      contentMatches: read.ok && meaningfulInvoiceContentMatches(JSON.parse(target.requestBody), read.content),
      cashCollectedCents: read.ok ? read.cashCollectedCents : 0,
      paidAt: read.ok ? read.paidAt : null,
    });
  }
  return completeQboInvoiceSync(ctx, {
    actorId: start.actorId, connectionId: start.connectionId, realmId: start.realmId,
    requestId, observations,
  });
}

export class QboOAuthClient {
  constructor(private readonly config: QboConfig, private readonly transport: typeof globalThis.fetch = globalThis.fetch) {}

  get redirectUri() { return this.config.redirectUri; }

  get requestedScopes() {
    return [QBO_ACCOUNTING_SCOPE, ...(this.config.taxApiBaseUrl ? [QBO_TAX_SCOPE] : [])];
  }

  authorizeUrl(state: string) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.requestedScopes.join(" "));
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

  async readInvoice(
    realmId: string,
    remoteId: string,
    accessToken: string,
    paymentCache: QboPaymentCache = new Map(),
  ): Promise<QboInvoiceRead> {
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
    const paymentIds = [...new Set(linked.flatMap((item) => item && typeof item === "object"
      && (item as Record<string, unknown>).TxnType === "Payment"
      && typeof (item as Record<string, unknown>).TxnId === "string"
      ? [(item as Record<string, unknown>).TxnId as string] : []))];
    let cashCollectedCents = 0;
    for (const paymentId of paymentIds) {
      const key = `${realmId}:${paymentId}`;
      let allocations = paymentCache.get(key);
      if (!allocations) {
        allocations = this.readPaymentCashAllocations(realmId, paymentId, accessToken);
        paymentCache.set(key, allocations);
      }
      cashCollectedCents += (await allocations).get(remoteId) ?? 0;
    }
    const updated = invoice.MetaData && typeof invoice.MetaData === "object"
      ? (invoice.MetaData as Record<string, unknown>).LastUpdatedTime : null;
    return {
      ok: true, syncToken: invoice.SyncToken, totalCents, balanceCents, taxCents,
      cashCollectedCents: Math.min(cashCollectedCents, totalCents),
      paidAt: typeof updated === "string" && Number.isFinite(Date.parse(updated)) ? updated : null,
      privateNote: typeof invoice.PrivateNote === "string" ? invoice.PrivateNote : "",
      content: meaningfulInvoiceContent(invoice),
    };
  }

  private async readPaymentCashAllocations(realmId: string, paymentId: string, accessToken: string) {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/payment/${encodeURIComponent(paymentId)}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.transport(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) throw new Error("QuickBooks payment response was invalid");
    const payload = await response.json() as { Payment?: Record<string, unknown> };
    const payment = payload?.Payment;
    const cents = (value: unknown) => {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
      const result = Math.round(value * 100);
      return Number.isSafeInteger(result) ? result : null;
    };
    const total = cents(payment?.TotalAmt);
    const unapplied = cents(payment?.UnappliedAmt);
    if (!payment || payment.Id !== paymentId || total === null || unapplied === null || unapplied > total
      || !Array.isArray(payment.Line)) throw new Error("QuickBooks payment response was invalid");

    const applications = new Map<string, number>();
    let attributionAmbiguous = false;
    for (const line of payment.Line) {
      if (!line || typeof line !== "object") continue;
      const row = line as Record<string, unknown>;
      const links = Array.isArray(row.LinkedTxn) ? row.LinkedTxn : [];
      const invoiceIds = [...new Set(links.flatMap((link) => link && typeof link === "object"
        && (link as Record<string, unknown>).TxnType === "Invoice"
        && typeof (link as Record<string, unknown>).TxnId === "string"
        ? [(link as Record<string, unknown>).TxnId as string] : []))];
      if (invoiceIds.length === 0) continue;
      const lineCents = cents(row.Amount);
      if (lineCents === null || invoiceIds.length !== 1) {
        attributionAmbiguous = true;
        for (const invoiceId of invoiceIds) applications.set(invoiceId, 0);
        continue;
      }
      applications.set(invoiceIds[0], (applications.get(invoiceIds[0]) ?? 0) + lineCents);
    }

    const appliedCash = total - unapplied;
    const totalApplications = [...applications.values()].reduce((sum, amount) => sum + amount, 0);
    if (attributionAmbiguous || (applications.size > 1 && appliedCash < totalApplications)) {
      return new Map([...applications.keys()].map((invoiceId) => [invoiceId, 0]));
    }
    if (applications.size === 1) {
      const [invoiceId, applied] = applications.entries().next().value!;
      applications.set(invoiceId, Math.min(applied, appliedCash));
    }
    return applications;
  }

  async readInvoiceLink(realmId: string, remoteId: string, accessToken: string) {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/invoice/${encodeURIComponent(remoteId)}`, this.config.apiBaseUrl);
    url.searchParams.set("include", "invoiceLink");
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.transport(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) return { ok: false as const, status: response.status };
    const payload = await response.json() as { Invoice?: Record<string, unknown> };
    if (!payload.Invoice || payload.Invoice.Id !== remoteId) throw new Error("QuickBooks response was invalid");
    return {
      ok: true as const,
      invoiceLink: typeof payload.Invoice.InvoiceLink === "string" ? payload.Invoice.InvoiceLink : null,
    };
  }

  async calculateSalesTax(input: QboTaxInput, accessToken: string) {
    if (!this.config.taxApiBaseUrl) throw new Error("QuickBooks tax calculation unavailable");
    const response = await this.transport(this.config.taxApiBaseUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      redirect: "error",
      body: JSON.stringify({
        query: `mutation IndirectTaxCalculateSaleTransactionTax($input: IndirectTax_TaxCalculationInput!) { indirectTaxCalculateSaleTransactionTax(input: $input) { taxCalculation { taxTotals { totalTaxAmountExcludingShipping { value currency } } shipping { taxAmount { value currency } } } } }`,
        variables: { input: {
          transactionDate: input.transactionDate,
          subject: { qbCustomerId: input.customerId },
          shipping: {
            shipFromAddress: { freeFormAddressLine: input.sourceAddress },
            shipToAddress: { freeFormAddressLine: input.destinationAddress },
          },
          lineItems: input.lines.map((line) => ({
            numberOfUnits: line.qty,
            productVariantTaxability: { productVariantId: line.itemId },
            pricePerUnitExcludingTaxes: { value: (line.unitPriceCents / 100).toFixed(2), currency: "USD" },
          })),
        } },
      }),
    });
    if (!response.ok) throw new Error("QuickBooks tax calculation unavailable");
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") throw new Error("QuickBooks tax calculation unavailable");
    const root = payload as Record<string, unknown>;
    if (Array.isArray(root.errors) && root.errors.length) throw new Error("QuickBooks tax calculation unavailable");
    const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : null;
    const operation = data?.indirectTaxCalculateSaleTransactionTax;
    const operationRow = operation && typeof operation === "object" ? operation as Record<string, unknown> : null;
    const calculationValue = operationRow?.taxCalculation;
    const calculation = calculationValue && typeof calculationValue === "object" ? calculationValue as Record<string, unknown> : null;
    const totalsValue = calculation?.taxTotals;
    const totals = totalsValue && typeof totalsValue === "object" ? totalsValue as Record<string, unknown> : null;
    const shippingValue = calculation?.shipping;
    const shipping = shippingValue && typeof shippingValue === "object" ? shippingValue as Record<string, unknown> : null;
    const cents = (money: unknown) => {
      if (!money || typeof money !== "object") return null;
      const row = money as { value?: unknown; currency?: unknown };
      if (row.currency !== "USD") return null;
      const value = typeof row.value === "string"
        ? row.value
        : typeof row.value === "number" && Number.isFinite(row.value)
          && row.value >= 0 && row.value <= Number.MAX_SAFE_INTEGER
          ? row.value.toString()
          : null;
      if (value === null) return null;
      const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
      if (!match) return null;
      const result = BigInt(`${match[1]}${(match[2] ?? "").padEnd(2, "0")}`);
      return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
    };
    const lineTax = cents(totals?.totalTaxAmountExcludingShipping);
    const shippingTax = cents(shipping?.taxAmount);
    if (lineTax === null || shippingTax === null || !Number.isSafeInteger(lineTax + shippingTax)) {
      throw new Error("QuickBooks tax calculation unavailable");
    }
    return lineTax + shippingTax;
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
  const result: Record<string, unknown> = {};
  const field = (source: string, target: string, value: unknown = invoice[source]) => {
    if (Object.hasOwn(invoice, source)) result[target] = value;
  };
  field("CustomerRef", "customer", ref(invoice.CustomerRef));
  field("DocNumber", "docNumber");
  field("TxnDate", "txnDate");
  field("DueDate", "dueDate");
  field("AllowOnlineACHPayment", "allowAch");
  field("AllowOnlineCreditCardPayment", "allowCard");
  field("Line", "lines", lines.filter((line) => line && typeof line === "object"
      && (line as Record<string, unknown>).DetailType === "SalesItemLineDetail").map((line) => {
      const row = line as Record<string, unknown>;
      const detail = row.SalesItemLineDetail as Record<string, unknown> | undefined;
      return {
        amount: row.Amount, description: row.Description, item: ref(detail?.ItemRef),
        qty: detail?.Qty, unitPrice: detail?.UnitPrice,
      };
    }));
  return result;
}

function meaningfulInvoiceContentMatches(expectedInvoice: Record<string, unknown>, actual: Record<string, unknown>) {
  const expected = meaningfulInvoiceContent(expectedInvoice);
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

export function qboConfig(env: Record<string, string | undefined> = process.env): QboConfig {
  try { return readQboEnv(env); } catch { throw new Error("QuickBooks setup is unavailable"); }
}

export function isQboConfigured(env: Record<string, string | undefined> = process.env) {
  try { readQboEnv(env); return true; } catch { return false; }
}
