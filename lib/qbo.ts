import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { oauthState, sha256 } from "@/lib/hash";
import { canRun, CommandError, unwrap, type Ctx } from "@/lib/commands/registry";
import { hasAnyRole } from "@/lib/mgr/roles";
import { consumeAdmission } from "@/lib/commands/admission";
import {
  beginQboInvoiceSync,
  compareAndSwapPortalInvoicePaymentTokens,
  compareAndSwapQboTokens,
  completeQboInvoiceSync,
  recordQboInvoiceSyncFailure,
  confirmPortalInvoicePayment,
  finishQboPush,
  finishQboReceiptBill,
  leaseQboTokenRefresh,
  markQboAuthorizationFailed,
  readPortalInvoicePayment,
  readPortalQuoteTaxTokens,
  getQboHealth,
  readVersionedIntegrationTokens,
  releaseQboTokenRefresh,
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
/** A QuickBooks Customer as read from the query API; absent optional contact fields are null. */
export type QboCustomer = {
  id: string; displayName: string; companyName: string | null;
  email: string | null; phone: string | null;
  billAddress1: string | null; billAddress2: string | null;
  billCity: string | null; billState: string | null; billZip: string | null;
  active: boolean; syncToken: string;
  /** MetaData.LastUpdatedTime exactly as QuickBooks sent it (precision and offset preserved). */
  updatedAt: string;
};
/** Outcome of a Customer create/update POST. A definite answer only: lost or malformed responses throw (outcome unknown). */
export type QboCustomerWriteResult =
  | { ok: true; customer: QboCustomer }
  | { ok: false; status: number; code: string | null; message: string;
      /** Intuit's per-response id for support, read from the `intuit_tid` response header (header name unconfirmed by rendered docs); null when absent. */
      intuitRequestId: string | null; requestId: string;
      /** authorization: 401/403. stale_token: code 5010. validation: 400/422 only, the one definite "not written" answer. retryable: every other status (408, 409, 429, 5xx...), outcome unknown. */
      kind: "authorization" | "stale_token" | "retryable" | "validation" };
/** A QuickBooks customer or item offered by the mapping picker: its exact id and the name a person reads. */
export type QboRecord = { id: string; name: string };
const QUERY_PAGE_SIZE = 1000; // documented MAXRESULTS ceiling for a query
const QBO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):?(\d{2}))$/;
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
  /** Records the refresh token Intuit issued on the exchanging intent, so a reap can revoke it if this callback dies. */
  hold(intentId: string, actorId: string, realmId: string, refreshToken: string): Promise<void>;
  /** realmLabel is the verified QuickBooks CompanyName, or null when QuickBooks returned none. */
  complete(intentId: string, actorId: string, realmId: string, tokens: QboTokens, realmLabel: string | null): Promise<string>;
  /** Marks the intent recovery_required; false when it had already left 'exchanging' (e.g. complete committed). */
  fail(intentId: string, actorId: string): Promise<boolean>;
  /** True when a stored (not disconnected) connection of any brewery uses this QuickBooks realm. */
  realmInUse(realmId: string): Promise<boolean>;
};

export type QboPushStart = {
  pushId?: string;
  providerRequestId?: string;
  finishRequestId?: string;
  requestBody?: string;
  entityType?: "Invoice" | "CreditMemo";
  realmId?: string;
  connectionId?: string;
  status: "pending" | "pushed" | "push_failed";
  remoteId?: string;
  /** Only the call that first freezes a push may POST without reconciliation. Never cached for replay. */
  mayPost?: boolean;
  alreadyPushed?: boolean;
  alreadyFinished?: boolean;
  error?: string;
};

type QboInvoiceRead = {
  ok: true;
  syncToken: string;
  taxCents: number;
  totalCents: number;
  balanceCents: number | null;
  cashCollectedCents: number;
  /** Legacy observation slot; transport supplies null, not a settlement date. */
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

const QBO_SETUP_UNAVAILABLE = "QuickBooks setup is unavailable";

/**
 * The payment-failure log fields: enough cause for staff, never a provider body.
 * Only messages MGR writes itself (a QboHttpError, a CommandError, the
 * missing-setup error) are kept; any other error, which may carry tokens or a
 * bearer link, logs its name.
 */
export function qboPaymentFailureCause(error: unknown) {
  if (error instanceof QboHttpError) return { name: error.name, status: error.status, message: error.message };
  if (error instanceof CommandError) {
    return { name: error.name, status: error.status, code: error.code, message: error.message };
  }
  if (!(error instanceof Error)) return { name: typeof error };
  return error.message === QBO_SETUP_UNAVAILABLE ? { name: error.name, message: error.message } : { name: error.name };
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

/**
 * Every Intuit request gives up after 20 seconds. The SQL refresh lease
 * lasts 45 seconds, leaving 25 seconds for the store and release calls, so a
 * holder's lease does not run out during its Intuit call (#1032).
 */
const QBO_REQUEST_TIMEOUT_MS = 20_000;
// Stop reading before the command route's 300-second limit, leaving room for
// a refresh lease wait, reconciliation, or durable failure recording.
const QBO_SYNC_TIMEOUT_MS = 180_000;
/** How long a caller waits on another caller's refresh: past one 45-second lease, so a crashed holder's lease expires first. */
const QBO_REFRESH_WAIT_MS = 50_000;
const QBO_REFRESH_POLL_MS = 200;

/**
 * Runs `refresh` (the Intuit call plus its compare-and-swap) while holding the
 * connection's refresh lease, so one caller at a time sends the refresh token
 * (#1032). Intuit retires the old refresh token when it issues a new one, so
 * two parallel refreshes could leave a dead token stored. A caller that finds
 * the lease held polls until the holder stores newer credentials, then gets
 * "superseded" and re-reads them instead of refreshing. "unavailable" means
 * the connection left 'connected' (for example the holder hit invalid_grant)
 * or this actor may not store a refresh, so it must not call Intuit at all.
 * A portal caller passes the invoice or quote whose live claim authorizes it.
 */
async function withQboRefreshLease<T>(
  ctx: Ctx,
  expected: VersionedIntegrationTokens,
  refresh: (lease: string) => Promise<T>,
  invoiceId?: string,
  quoteId?: string,
): Promise<T | "superseded" | "unavailable"> {
  const lease = randomUUID();
  const deadline = Date.now() + QBO_REFRESH_WAIT_MS;
  for (;;) {
    const state = await leaseQboTokenRefresh(ctx, expected, lease, invoiceId, quoteId);
    if (state === "superseded" || state === "unavailable") return state;
    if (state === "leased") break;
    if (Date.now() >= deadline) throw new Error("QuickBooks is unavailable");
    await sleep(QBO_REFRESH_POLL_MS);
  }
  try {
    return await refresh(lease);
  } finally {
    // Logging and dropping a failed release is safe: the lease expires by itself
    // after 45 seconds, and throwing here would hide the refresh outcome.
    await releaseQboTokenRefresh(ctx, expected.connectionId, lease)
      .catch((error: unknown) => console.error("qbo_refresh_lease_release_failed", qboPaymentFailureCause(error)));
  }
}

export type PortalInvoicePaymentResult =
  | { kind: "redirect"; url: string }
  | { kind: "unavailable"; reason: "not_configured" | "provider_unavailable" | "link_unavailable" | "context_changed" | "rate_limited" };

async function refreshPortalInvoicePayment(
  ctx: Ctx,
  invoiceId: string,
  claim: PortalInvoicePaymentClaim,
  client: QboOAuthClient,
) {
  if (isPast(claim.refreshExpiresAt) || isPast(claim.refreshHardExpiresAt)) {
    await markQboAuthorizationFailed(ctx, claim, invoiceId);
    return null;
  }
  const stored = await withQboRefreshLease(ctx, claim, async () => {
    const next = await client.refresh(claim.refreshToken).catch(async (error) => {
      if (error instanceof QboInvalidGrantError) await markQboAuthorizationFailed(ctx, claim, invoiceId);
      else console.error("qbo_payment_refresh_failed", qboPaymentFailureCause(error));
      // A failed provider refresh keeps the buyer on Payment unavailable.
      return null;
    });
    if (next === null) return false;
    if (await compareAndSwapPortalInvoicePaymentTokens(ctx, invoiceId, claim, next)) return true;
    // Intuit may have retired the stored refresh token; see refreshQboCredentials.
    console.error("qbo_payment_refresh_store_failed");
    await markQboAuthorizationFailed(ctx, claim, invoiceId);
    return false;
  }, invoiceId);
  if (stored === false || stored === "unavailable") return null;
  // Stored here, or "superseded" by another caller's stored refresh: read the current claim.
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
  // Authorize the concrete invoice before spending the shared per-user budget.
  // Admission precedes every provider read, including refresh and its retry.
  if (!(await consumeAdmission(ctx.db)).allowed) return { kind: "unavailable", reason: "rate_limited" };
  let refreshed = false;
  if (isPast(claim.accessExpiresAt)) {
    const next = await refreshPortalInvoicePayment(ctx, invoiceId, claim, client);
    if (!next) return { kind: "unavailable", reason: "provider_unavailable" };
    claim = next;
    refreshed = true;
  }
  // A thrown read (network, invalid response) reaches the Pay route, which
  // logs it and shows the buyer Payment unavailable.
  let read = await client.readInvoiceLink(claim.realmId, claim.remoteInvoiceId, claim.accessToken);
  if (!read.ok && read.status === 401 && !refreshed) {
    const next = await refreshPortalInvoicePayment(ctx, invoiceId, claim, client);
    if (!next) return { kind: "unavailable", reason: "provider_unavailable" };
    claim = next;
    read = await client.readInvoiceLink(claim.realmId, claim.remoteInvoiceId, claim.accessToken);
  }
  if (!read.ok) return { kind: "unavailable", reason: "provider_unavailable" };
  const url = read.invoiceLink ? validateQboPaymentUrl(read.invoiceLink, allowedHosts) : null;
  if (!url) return { kind: "unavailable", reason: "link_unavailable" };
  if (!await confirmPortalInvoicePayment(ctx, invoiceId, claim)) {
    return { kind: "unavailable", reason: "context_changed" };
  }
  return { kind: "redirect", url: url.href };
}

/**
 * The connected company's active customers or items, read live when the
 * mapping dialog opens, sorted by name (#1515). A person picks one; MGR never
 * matches or preselects by name. One 401 refreshes the token and reads again;
 * any other failure says only that QuickBooks is unavailable.
 */
export async function listQboRecords(ctx: Ctx, kind: "customer" | "item", client: QboOAuthClient): Promise<QboRecord[]> {
  const health = await getQboHealth(ctx);
  // A connected row always carries its realm; reading it this way only narrows the type.
  const realmId = health.connected ? health.realmId : undefined;
  if (!realmId) throw new CommandError("Connect QuickBooks before mapping records", 409, "conflict");
  const read = async (accessToken: string): Promise<QboRecord[]> => kind === "item"
    ? client.queryItems(realmId, accessToken)
    : (await client.queryCustomers(realmId, accessToken)).filter(row => row.active).map(row => ({ id: row.id, name: row.displayName }));
  let tokens = await readVersionedIntegrationTokens(ctx, "qbo");
  if (tokens.connectionId !== health.connectionId) throw new CommandError("QuickBooks connection changed", 409, "conflict");
  let refreshed = false;
  if (isPast(tokens.accessExpiresAt)) {
    tokens = await refreshQboCredentials(ctx, client, tokens);
    refreshed = true;
  }
  let records: QboRecord[];
  try {
    records = await read(tokens.accessToken);
  } catch (error) {
    if (refreshed || !(error instanceof QboHttpError && error.status === 401)) throw new Error(sanitizeQboError(error));
    tokens = await refreshQboCredentials(ctx, client, tokens);
    records = await read(tokens.accessToken).catch((retryError: unknown) => { throw new Error(sanitizeQboError(retryError)); });
  }
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

export async function beginQboOAuth(ctx: Ctx, client: QboOAuthClient, providerIntent: "connect" | "reconnect", requestId: string = randomUUID()) {
  if (!hasAnyRole(ctx.roles, ["admin"])) throw new CommandError("permission denied: brewery admin required", 403);
  const state = oauthState();
  await unwrap(ctx.db.rpc("begin_qbo_oauth", {
    p_brewery: ctx.breweryId, p_redirect_uri: client.redirectUri, p_state_hash: sha256(state),
    p_provider_intent: providerIntent, p_request_id: requestId, p_requested_scopes: client.requestedScopes,
  }));
  return { authorizeUrl: client.authorizeUrl(state) };
}

function isPast(value: string | null) {
  return value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}

/** Refreshes the stored QuickBooks credential through its compare-and-swap; returns the persisted winner. */
export async function refreshQboCredentials(
  ctx: Ctx,
  client: Pick<QboOAuthClient, "refresh">,
  expected?: VersionedIntegrationTokens,
  quoteId?: string,
) {
  const current = expected ?? await (quoteId ? readPortalQuoteTaxTokens(ctx, quoteId) : readVersionedIntegrationTokens(ctx, "qbo"));
  if (isPast(current.refreshExpiresAt) || isPast(current.refreshHardExpiresAt)) {
    await markQboAuthorizationFailed(ctx, current, undefined, quoteId);
    throw new Error("QuickBooks is unavailable");
  }
  // A "superseded" lease means another caller stored newer tokens; the read below returns them.
  const outcome = await withQboRefreshLease(ctx, current, async (lease) => {
    const next = await client.refresh(current.refreshToken).catch(async (error) => {
      if (error instanceof QboInvalidGrantError) await markQboAuthorizationFailed(ctx, current, undefined, quoteId, lease);
      throw new Error(sanitizeQboError(error));
    });
    // Accepted window (#1073): if the process dies or the token request times
    // out after Intuit rotated the refresh token but before this CAS commits,
    // the stored token is retired. The next refresh gets invalid_grant and
    // marks the connection for recovery, so an Admin reconnects.
    try {
      await compareAndSwapQboTokens(ctx, current, next, quoteId, lease);
    } catch (error) {
      // Intuit has answered, so the stored refresh token may now be retired.
      // Mark the connection for recovery so no caller refreshes with it. The
      // mark is a no-op when newer tokens were stored (the CAS committed but
      // its response was lost, or another caller won) or the connection changed.
      console.error("qbo_refresh_store_failed", qboPaymentFailureCause(error));
      await markQboAuthorizationFailed(ctx, current, undefined, quoteId, lease);
      if (!(error instanceof CommandError) || error.status !== 409) throw new Error(sanitizeQboError(error));
    }
  }, undefined, quoteId);
  if (outcome === "unavailable") throw new Error("QuickBooks is unavailable");
  const stored = await (quoteId ? readPortalQuoteTaxTokens(ctx, quoteId) : readVersionedIntegrationTokens(ctx, "qbo"))
    .catch((error) => { throw new Error(sanitizeQboError(error)); });
  if (stored.connectionId !== current.connectionId || stored.credentialVersion <= current.credentialVersion) {
    throw new Error("QuickBooks is unavailable");
  }
  return stored;
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
  let tokens: QboTokens | null = null;
  let storing = false;
  try {
    tokens = await input.client.exchange(code);
    await input.store.hold(claim.intentId, input.actorId, realmId, tokens.refreshToken);
    if (tokens.grantedScopes?.some((scope) => !claim.requestedScopes.includes(scope))) {
      throw new Error("QuickBooks token response was invalid");
    }
    const companyName = await input.client.verifyRealm(realmId, tokens.accessToken);
    storing = true;
    return await input.store.complete(claim.intentId, input.actorId, realmId, {
      ...tokens, grantedScopes: tokens.grantedScopes ?? [...claim.requestedScopes],
    }, companyName);
  } catch (error) {
    // Tokens issued but never stored would stay live at Intuit; revoking the
    // refresh token revokes its access token too. But Intuit's revoke
    // disconnects the app from that QuickBooks company, so skip it when a
    // stored connection (this brewery's or another's) already uses the realm,
    // or when that cannot be checked. Best effort: a revoke failure must not
    // mask the original failure.
    const revoke = async (refreshToken: string) => {
      if (await input.store.realmInUse(realmId).catch(() => true)) return;
      await input.client.revoke(refreshToken).catch(() => undefined);
    };
    // Before the store write the tokens are certainly unstored.
    if (tokens && !storing) await revoke(tokens.refreshToken);
    const recorded = await input.store.fail(claim.intentId, input.actorId);
    // A failed store.complete may still have committed (lost response).
    // fail_qbo_oauth returns false once the intent left 'exchanging', and then
    // the stored credential is live, so revoke only when fail recorded it.
    if (tokens && storing && recorded) await revoke(tokens.refreshToken);
    throw new Error(sanitizeQboError(error));
  }
}

export type QboOAuthReapStore = {
  reap(): Promise<{ intentId: string; realmId: string; refreshToken: string; giveUp: boolean }[]>;
  realmInUse(realmId: string): Promise<boolean>;
  discard(intentId: string, refreshToken: string): Promise<void>;
};

/**
 * Retention-job step (#1034): revokes each refresh token Intuit issued to an
 * OAuth callback that never stored it, then discards it. Like the callback's
 * own failure path, it skips the revoke when a stored connection uses the
 * realm, because Intuit's revoke would disconnect that company. A failed
 * revoke keeps the token for the next daily run, until the reap marks it
 * giveUp (seven days); then it is discarded unrevoked. A failed realm lookup
 * or discard also keeps it. Each row's failure is logged and counted, and
 * never stops the other rows; qboPaymentFailureCause logs only the error name
 * for these plain errors, never a token or provider body.
 */
export async function reapQboOAuthExchanges(store: QboOAuthReapStore, client: Pick<QboOAuthClient, "revoke">) {
  let done = 0;
  let failed = 0;
  for (const held of await store.reap()) {
    try {
      if (!await store.realmInUse(held.realmId)) {
        await client.revoke(held.refreshToken).catch((error: unknown) => {
          if (!held.giveUp) throw error;
          console.error("qbo_oauth_reap_revoke_abandoned", qboPaymentFailureCause(error));
        });
      }
      await store.discard(held.intentId, held.refreshToken);
      done += 1;
    } catch (error) {
      failed += 1;
      console.error("qbo_oauth_reap_failed", qboPaymentFailureCause(error));
    }
  }
  return { done, failed };
}

export async function pushInvoiceToQbo(
  ctx: Ctx,
  invoiceId: string,
  requestId: string,
  client: QboOAuthClient,
  newAttemptReason?: "corrected" | "remote_deleted",
) {
  if (!hasAnyRole(ctx.roles, ["admin", "sales"])) {
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
  if (!start.mayPost) {
    let found = await client.findInvoice(start.realmId, start.entityType, start.requestBody, tokens.accessToken)
      .catch((error: unknown) => { throw new Error(sanitizeQboError(error)); });
    if (!found.ok && found.status === 401 && !refreshed) {
      tokens = await refreshQboCredentials(ctx, client, tokens);
      refreshed = true;
      if (tokens.connectionId !== start.connectionId) throw new Error("QuickBooks is unavailable");
      found = await client.findInvoice(start.realmId, start.entityType, start.requestBody, tokens.accessToken)
        .catch((error: unknown) => { throw new Error(sanitizeQboError(error)); });
    }
    if (!found.ok) throw new Error("QuickBooks is unavailable");
    if (found.transaction) {
      return finishQboPush(ctx, {
        pushId: start.pushId, finishRequestId: start.finishRequestId, status: "pushed",
        remoteId: found.transaction.remoteId, error: null, response: found.transaction.response,
      });
    }
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

type ReceiptBillStart = {
  receiptId: string; status: "pending" | "pushed" | "push_failed"; remoteId?: string; error?: string;
  mayPost?: boolean; providerRequestId?: string; requestBody?: string; realmId?: string; connectionId?: string;
};

/** Query before retry; replay only the frozen payload and provider request ID. */
export async function postReceiptBill(ctx: Ctx, receiptId: string, requestId: string, client: QboOAuthClient, newAttemptReason?: "corrected") {
  if (!canRun(ctx, "post_receipt_bill")) throw new CommandError("permission denied: receipt Bills require admin", 403, "permission_denied");
  const start = await unwrap(ctx.db.rpc("start_qbo_receipt_bill", {
    p_brewery: ctx.breweryId, p_receipt: receiptId, p_request_id: requestId, p_new_attempt_reason: newAttemptReason ?? null,
  })) as ReceiptBillStart;
  if (start.status === "pushed" && start.remoteId) return { receiptId: start.receiptId, status: "pushed" as const, remoteId: start.remoteId };
  if (start.status === "push_failed") throw new CommandError(start.error ?? "QuickBooks rejected the Bill; fix mappings and choose Post corrected Bill", 400);
  if (!start.providerRequestId || !start.requestBody || !start.realmId || !start.connectionId) throw new Error("Bill snapshot was invalid");
  const { providerRequestId, requestBody, realmId, connectionId } = start;
  const outcomeUnknown = "Bill outcome is uncertain; retry the exact Bill request to reconcile it without duplication.";
  const record = (remoteId: string | null, error: string | null, response: Record<string, unknown>, definitiveRejection = false) => finishQboReceiptBill(ctx, {
    receiptId: start.receiptId, providerRequestId, remoteId, error, response, definitiveRejection,
  });
  let tokens = await readVersionedIntegrationTokens(ctx, "qbo");
  if (tokens.connectionId !== connectionId) throw new CommandError("QuickBooks connection changed; reconcile the Bill in its original company", 409, "conflict");
  if (isPast(tokens.accessExpiresAt)) tokens = await refreshQboCredentials(ctx, client, tokens);
  if (tokens.connectionId !== connectionId) throw new CommandError("QuickBooks connection changed", 409, "conflict");
  if (!start.mayPost) {
    // A failed lookup cannot establish whether this earlier POST created a Bill.
    let found = await client.findReceiptBill(realmId, providerRequestId, requestBody, tokens.accessToken)
      .catch(() => { throw new CommandError(outcomeUnknown, 409, "conflict"); });
    if (!found.ok && found.status === 401) {
      tokens = await refreshQboCredentials(ctx, client, tokens);
      if (tokens.connectionId !== connectionId) throw new CommandError("QuickBooks connection changed", 409, "conflict");
      found = await client.findReceiptBill(realmId, providerRequestId, requestBody, tokens.accessToken)
        .catch(() => { throw new CommandError(outcomeUnknown, 409, "conflict"); });
    }
    if (found.ok && found.remoteId) return record(found.remoteId, null, { Id: found.remoteId });
    if (!found.ok) throw new CommandError(outcomeUnknown, 409, "conflict");
  }
  // Replays use the frozen company, request id and bytes, including after an uncertain POST.
  // https://developer.intuit.com/app/developer/qbo/docs/learn/learn-basic-field-definitions
  const created = await client.createTransaction(realmId, "Bill", providerRequestId, requestBody, tokens.accessToken).catch(async (error: unknown) => {
    // Only a failure after starting the POST has an uncertain provider outcome.
    // A failed diagnostic write must not replace that original transport failure.
    await record(null, outcomeUnknown, {}).catch(() => {
      console.error("qbo_receipt_bill_failure_record_failed", { receiptId: start.receiptId, providerRequestId });
    });
    if (error instanceof CommandError) throw error;
    throw new CommandError(outcomeUnknown, 409, "conflict");
  });
  // Keep success recording outside the transport catch: a failed commit is not a rejection.
  if (created.ok) return record(created.remoteId, null, created.response);
  const message = created.definitive
    ? "QuickBooks rejected this Bill. Fix its vendor or purchase account in Accounting, then choose Post corrected Bill."
    : outcomeUnknown;
  await record(null, message, {}, created.definitive).catch(() => {
    console.error("qbo_receipt_bill_failure_record_failed", { receiptId: start.receiptId, providerRequestId });
  });
  throw new CommandError(message, created.definitive ? 400 : 409, created.definitive ? "validation_error" : "conflict");
}

export async function syncQboInvoices(ctx: Ctx, requestId: string, client: QboOAuthClient) {
  if (!hasAnyRole(ctx.roles, ["admin", "sales"])) {
    throw new CommandError("permission denied: QuickBooks sync requires admin or sales", 403, "permission_denied");
  }
  const start = await beginQboInvoiceSync(ctx, requestId);
  if ("replayResult" in start) return start.replayResult;
  const deadline = AbortSignal.timeout(QBO_SYNC_TIMEOUT_MS);
  try {
    if (start.targets.length === 0) {
      return await completeQboInvoiceSync(ctx, {
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
      if (deadline.aborted) throw new Error("QuickBooks is unavailable");
      // Old batches froze invoices only. An explicit unknown type is not legacy.
      const entityType = target.entityType === undefined ? "Invoice" : target.entityType;
      if (entityType !== "Invoice" && entityType !== "CreditMemo") throw new Error("QuickBooks sync entity type was invalid");
      let read = await client.readInvoice(start.realmId, target.remoteId, tokens.accessToken, paymentCache, entityType, deadline)
        .catch(() => { throw new Error("QuickBooks is unavailable"); });
      if (!read.ok && read.status === 401) {
        if (deadline.aborted) throw new Error("QuickBooks is unavailable");
        tokens = await refreshQboCredentials(ctx, client, tokens);
        if (tokens.connectionId !== start.connectionId) throw new Error("QuickBooks is unavailable");
        read = await client.readInvoice(start.realmId, target.remoteId, tokens.accessToken, paymentCache, entityType, deadline)
          .catch(() => { throw new Error("QuickBooks is unavailable"); });
      }
      if (!read.ok && !read.definitive) throw new Error("QuickBooks is unavailable");
      const pushedTotal = typeof target.pushedResponse?.TotalAmt === "number"
        ? Math.round(target.pushedResponse.TotalAmt * 100) : null;
      const remoteState = entityType === "Invoice" && read.ok && /^Voided\b/i.test(read.privateNote) && read.totalCents === 0
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
    if (deadline.aborted) throw new Error("QuickBooks is unavailable");
    return await completeQboInvoiceSync(ctx, {
      actorId: start.actorId, connectionId: start.connectionId, realmId: start.realmId,
      requestId, observations,
    });
  } catch (error) {
    // The caller needs why the sync failed. A lost failure record only hides it
    // from status; the batch stays incomplete, so the same request can retry.
    try {
      await recordQboInvoiceSyncFailure(ctx, requestId);
    } catch (recordError) {
      console.error(`qbo sync ${requestId} failure could not be recorded:`, recordError instanceof Error ? recordError.message : recordError);
    }
    throw error;
  }
}

// The reading of a QuickBooks Accounting money field (a JSON number); the tax
// API's string amounts have their own parser in the tax calculation below.
// MGR stores money as integer cents, so a value that cannot round to an exact,
// safe integer number of cents is not a number MGR can hold — it is a malformed response, and the
// caller must reject it rather than carry `Infinity` or a lossy float into a
// total. Invoice and payment reads share this so they cannot disagree.
const cents = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
};

class QboInvalidGrantError extends Error {}
/**
 * A non-OK QuickBooks HTTP response; `status` lets callers branch (e.g. 401 -> refresh once and retry). Network failures are not wrapped and carry no status.
 * The message is always MGR's own fixed text, never the provider body, because failure logs keep it.
 */
export class QboHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "QboHttpError";
  }
}

/** Keep only accounting facts needed to finish a push, never provider secrets or links. */
function qboTransactionResult(entity: unknown) {
  const row = asObject(entity);
  if (!row || typeof row.Id !== "string" || !row.Id.trim()) throw new Error("QuickBooks response was invalid");
  const safe = Object.fromEntries(["Id", "SyncToken", "TotalAmt", "Balance"]
    .filter((key) => typeof row[key] === "string" || (typeof row[key] === "number" && Number.isFinite(row[key])))
    .map((key) => [key, row[key]]));
  const tax = asObject(row.TxnTaxDetail);
  if (tax && typeof tax.TotalTax === "number" && Number.isFinite(tax.TotalTax)) safe.TotalTax = tax.TotalTax;
  return { ok: true as const, remoteId: row.Id, response: safe };
}

export class QboOAuthClient {
  constructor(private readonly config: QboConfig, private readonly transport: typeof globalThis.fetch = globalThis.fetch) {}

  private request(input: Parameters<typeof fetch>[0], init: RequestInit) {
    const timeout = AbortSignal.timeout(QBO_REQUEST_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return this.transport(input, { ...init, signal });
  }

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

  /**
   * Reads every Customer (active and inactive) in the realm, optionally only those whose
   * Metadata.LastUpdatedTime is at or after `changedSince` (inclusive `>=`; the timestamp is sent
   * unchanged, so callers own any overlap they want).
   *
   * All-or-error: pages are buffered and returned only when the last page has been read and every
   * row validated; any HTTP, network, or shape failure rejects the whole call, never a partial list.
   * `realmId` and `accessToken` are trusted as provided by the stored connection (not validated here).
   * Limitations: paging is STARTPOSITION/MAXRESULTS over an unordered query (no ORDERBY: sortability
   * of Id is not documented), so customers created or deleted in QuickBooks while paging can shift
   * rows between pages and cause a skip or a repeat. A repeat is rejected as invalid (duplicate id);
   * a skip is not detectable here, and the next refresh must be allowed to cover it.
   */
  async queryCustomers(realmId: string, accessToken: string, changedSince?: string): Promise<QboCustomer[]> {
    if (changedSince !== undefined && !isQboTimestamp(changedSince)) {
      throw new Error("QuickBooks customer query changedSince must be an ISO-8601 timestamp with a time zone");
    }
    const where = `Active IN (true, false)${changedSince === undefined ? "" : ` AND Metadata.LastUpdatedTime >= '${changedSince}'`}`;
    return this.queryAll(realmId, accessToken, "Customer", where, parseCustomer);
  }

  /**
   * Reads every active Item for the mapping picker (#1515), named by its full
   * name ("Beer:Pils" for a sub-item). Category items are left out because an
   * invoice line cannot use one. All-or-error, paged like queryCustomers.
   */
  async queryItems(realmId: string, accessToken: string): Promise<QboRecord[]> {
    return this.queryAll(realmId, accessToken, "Item", "Active = true", parseItem);
  }

  /**
   * Pages `SELECT * FROM <entity> WHERE <where>` until a short page, parsing
   * each row with `parse`, which returns null for a row to leave out. Any HTTP,
   * shape or repeated-id failure rejects the whole read, never a partial list.
   */
  private async queryAll<T extends { id: string }>(realmId: string, accessToken: string, entity: "Customer" | "Item", where: string, parse: (raw: unknown) => T | null): Promise<T[]> {
    const invalid = () => new Error(`QuickBooks ${entity.toLowerCase()} response was invalid`);
    const rows: T[] = [];
    const seen = new Set<string>();
    for (let start = 1; ; start += QUERY_PAGE_SIZE) {
      const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/query`, this.config.apiBaseUrl);
      url.searchParams.set("query", `SELECT * FROM ${entity} WHERE ${where} STARTPOSITION ${start} MAXRESULTS ${QUERY_PAGE_SIZE}`);
      url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
      const response = await this.request(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        redirect: "error",
      });
      if (!response.ok) throw new QboHttpError(`QuickBooks ${entity.toLowerCase()} query failed (${response.status})`, response.status);
      const payload = asObject(await response.json().catch(() => null));
      const result = asObject(payload?.QueryResponse);
      if (!result || result.Fault !== undefined || payload?.Fault !== undefined) throw invalid();
      const raw = result[entity] ?? [];
      if (!Array.isArray(raw) || raw.length > QUERY_PAGE_SIZE) throw invalid();
      for (const row of raw.map(parse)) {
        if (!row) continue;
        if (seen.has(row.id)) throw invalid();
        seen.add(row.id);
        rows.push(row);
      }
      if (raw.length < QUERY_PAGE_SIZE) return rows;
    }
  }

  /**
   * POSTs a new Customer. `body` is the complete frozen JSON text and is sent byte-for-byte; the same
   * `requestId` + `body` must be reused for any retry. VERIFIED: the API takes a `requestid` query
   * parameter. NOT VERIFIED (no official statement found): that a repeated requestid returns the original
   * result, or for how long. Callers must not treat a lost response as "not created" on the strength of this.
   * Fault 6240 (duplicate name) is surfaced as kind "validation" with code "6240".
   */
  async createCustomer(realmId: string, requestId: string, body: string, accessToken: string): Promise<QboCustomerWriteResult> {
    const sent = asObject(parseFrozenBody(body));
    if (!sent || "Id" in sent || "SyncToken" in sent) throw new Error("QuickBooks customer create body must be a customer without Id or SyncToken");
    return this.postCustomer(realmId, requestId, body, accessToken);
  }

  /**
   * POSTs a sparse Customer update. `body` is the complete frozen sparse JSON text; its Id, SyncToken and
   * `sparse: true` must equal the arguments or this throws before any request. Sent unchanged. A stale token
   * (fault 5010) returns kind "stale_token"; this never fetches a new token or retries. Clearing a field
   * is NOT handled here: Intuit's sparse-update clearing semantics are unverified, so serializing a clear is
   * the caller's evidence-gated job. Documented: omitted fields are preserved by a sparse update.
   */
  async updateCustomer(realmId: string, requestId: string, id: string, syncToken: string, body: string, accessToken: string): Promise<QboCustomerWriteResult> {
    const sent = asObject(parseFrozenBody(body));
    if (!sent || sent.Id !== id || sent.SyncToken !== syncToken || sent.sparse !== true || !id || !syncToken) {
      throw new Error("QuickBooks customer update body does not match its Id, SyncToken and sparse envelope");
    }
    return this.postCustomer(realmId, requestId, body, accessToken, id);
  }

  private async postCustomer(realmId: string, requestId: string, body: string, accessToken: string, expectedId?: string): Promise<QboCustomerWriteResult> {
    if (!requestId.trim()) throw new Error("QuickBooks customer write needs a request id");
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/customer`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    url.searchParams.set("requestid", requestId);
    const response = await this.request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      body,
      redirect: "error",
    });
    const intuitRequestId = response.headers.get("intuit_tid")?.slice(0, 100) || null;
    if (!response.ok) {
      const { code, message } = customerFault(await response.json().catch(() => null));
      const kind = response.status === 401 || response.status === 403 ? "authorization"
        : code === "5010" ? "stale_token"
        : response.status === 400 || response.status === 422 ? "validation" : "retryable";
      return { ok: false, status: response.status, code, message: message ?? `QuickBooks customer write failed (${response.status})`, intuitRequestId, requestId, kind };
    }
    const payload = asObject(await response.json().catch(() => null));
    if (!payload || payload.Fault !== undefined) throw invalidCustomer();
    const customer = parseCustomer(payload.Customer);
    if (expectedId !== undefined && customer.id !== expectedId) throw invalidCustomer();
    return { ok: true, customer };
  }

  /** Confirms the token can read this realm's CompanyInfo; returns its CompanyName (trimmed), or null when blank. */
  async verifyRealm(realmId: string, accessToken: string) {
    const escapedRealm = encodeURIComponent(realmId);
    const url = new URL(`/v3/company/${escapedRealm}/companyinfo/${escapedRealm}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.request(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) throw new Error("QuickBooks company verification failed");
    const body = await response.json() as { CompanyInfo?: { Id?: unknown; CompanyName?: unknown } };
    if (typeof body.CompanyInfo?.Id !== "string" || !body.CompanyInfo.Id.trim()) {
      throw new Error("QuickBooks company verification failed");
    }
    const name = body.CompanyInfo.CompanyName;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  }

  async revoke(token: string) {
    const response = await this.request(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: this.basic(), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      redirect: "error",
    });
    if (!response.ok) throw new Error("QuickBooks revoke failed");
  }

  async createTransaction(realmId: string, entityType: "Invoice" | "CreditMemo" | "Bill", requestId: string, body: string, accessToken: string) {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/${entityType.toLowerCase()}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    url.searchParams.set("requestid", requestId);
    const response = await this.request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      body,
      redirect: "error",
    });
    if (!response.ok) return { ok: false as const, definitive: response.status === 400 || response.status === 422, status: response.status };
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("QuickBooks response was invalid");
    const entity = (payload as Record<string, unknown>)[entityType];
    return qboTransactionResult(entity);
  }

  /** Reconciles an uncertain frozen Invoice or CreditMemo before another POST. */
  async findInvoice(realmId: string, entityType: "Invoice" | "CreditMemo", body: string, accessToken: string) {
    const frozen = asObject(JSON.parse(body));
    const customer = asObject(frozen?.CustomerRef);
    if (!frozen || typeof frozen.DocNumber !== "string" || !/^\d+$/.test(frozen.DocNumber)
      || !customer || typeof customer.value !== "string" || !customer.value
      || typeof frozen.TxnDate !== "string") throw new Error("QuickBooks invoice identity was invalid");
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/query`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    url.searchParams.set("query", `select * from ${entityType} where DocNumber = '${frozen.DocNumber}'`);
    const response = await this.transport(url, {
      method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, redirect: "error",
    });
    if (!response.ok) return { ok: false as const, status: response.status };
    const payload = asObject(await response.json());
    const result = asObject(payload?.QueryResponse);
    if (!result || payload?.Fault !== undefined || result.Fault !== undefined) throw new Error("QuickBooks reconciliation response was invalid");
    const rows = result[entityType] === undefined ? [] : result[entityType];
    if (!Array.isArray(rows)) throw new Error("QuickBooks reconciliation response was invalid");
    if (rows.length === 0) return { ok: true as const, transaction: null };
    const row = asObject(rows[0]);
    if (rows.length !== 1 || !row || row.DocNumber !== frozen.DocNumber
      || asObject(row.CustomerRef)?.value !== customer.value || row.TxnDate !== frozen.TxnDate) {
      throw new Error("QuickBooks reconciliation identity was ambiguous");
    }
    return { ok: true as const, transaction: qboTransactionResult(row) };
  }

  async findReceiptBill(realmId: string, requestId: string, body: string, accessToken: string) {
    const frozen = JSON.parse(body) as { DocNumber: string };
    if (!/^MGR-[a-f0-9]{17}$/.test(frozen.DocNumber)) throw new Error("Bill identity was invalid");
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/query`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    url.searchParams.set("query", `select * from Bill where DocNumber = '${frozen.DocNumber}'`);
    const response = await this.request(url, {
      method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, redirect: "error",
    });
    if (!response.ok) return { ok: false as const, status: response.status };
    const payload = await response.json() as { QueryResponse?: { Bill?: unknown } };
    if (!payload?.QueryResponse || typeof payload.QueryResponse !== "object" || Array.isArray(payload.QueryResponse)) {
      throw new Error("Bill reconciliation response was invalid");
    }
    const rows = payload.QueryResponse.Bill ?? [];
    if (!Array.isArray(rows)) throw new Error("Bill reconciliation response was invalid");
    const matches = rows.filter((value: unknown): value is Record<string, unknown> => {
      if (!value || typeof value !== "object") return false;
      const row = value as Record<string, unknown>;
      return row.DocNumber === frozen.DocNumber && row.PrivateNote === `MGR receipt bill ${requestId}`
        && typeof row.Id === "string" && row.Id.length > 0;
    });
    if (rows.length !== 0 && (matches.length !== 1 || rows.length !== 1)) throw new Error("Bill reconciliation identity was ambiguous");
    return { ok: true as const, remoteId: matches.length === 1 ? matches[0].Id as string : null };
  }

  async readInvoice(
    realmId: string,
    remoteId: string,
    accessToken: string,
    paymentCache: QboPaymentCache = new Map(),
    entityType: "Invoice" | "CreditMemo" = "Invoice",
    signal?: AbortSignal,
  ): Promise<QboInvoiceRead> {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/${entityType.toLowerCase()}/${encodeURIComponent(remoteId)}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.request(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
      signal,
    });
    if (!response.ok) return { ok: false, status: response.status, definitive: response.status === 404 };
    const payload = await response.json() as Record<string, Record<string, unknown>>;
    const invoice = payload?.[entityType];
    const totalCents = cents(invoice?.TotalAmt);
    // Intuit CreditMemo has optional RemainingCredit, not Invoice Balance.
    // Validate it when present, but never store credit availability as invoice money due.
    const balanceField = entityType === "Invoice" ? invoice?.Balance : invoice?.RemainingCredit;
    const balanceCents = cents(balanceField);
    const tax = invoice?.TxnTaxDetail;
    const taxCents = cents(tax && typeof tax === "object" ? (tax as Record<string, unknown>).TotalTax : 0);
    if (!invoice || invoice.Id !== remoteId || typeof invoice.SyncToken !== "string"
      || totalCents === null || taxCents === null
      || (balanceCents === null && (entityType === "Invoice" || balanceField !== undefined))) {
      throw new Error("QuickBooks response was invalid");
    }
    // Credit application is not cash collection and never reads payment evidence.
    const linked = entityType === "Invoice" && Array.isArray(invoice.LinkedTxn) ? invoice.LinkedTxn : [];
    const paymentIds = [...new Set(linked.flatMap((item) => item && typeof item === "object"
      && (item as Record<string, unknown>).TxnType === "Payment"
      && typeof (item as Record<string, unknown>).TxnId === "string"
      ? [(item as Record<string, unknown>).TxnId as string] : []))];
    let cashCollectedCents = 0;
    for (const paymentId of paymentIds) {
      const key = `${realmId}:${paymentId}`;
      let allocations = paymentCache.get(key);
      if (!allocations) {
        allocations = this.readPaymentCashAllocations(realmId, paymentId, accessToken, signal);
        paymentCache.set(key, allocations);
      }
      cashCollectedCents += (await allocations).get(remoteId) ?? 0;
    }
    return {
      ok: true, syncToken: invoice.SyncToken, totalCents, balanceCents: entityType === "Invoice" ? balanceCents : null, taxCents,
      cashCollectedCents: Math.min(cashCollectedCents, totalCents),
      // Invoice edits are not payment dates. Reconciliation records its own
      // confirmation marker only after the existing balance/cash guards pass.
      paidAt: null,
      privateNote: typeof invoice.PrivateNote === "string" ? invoice.PrivateNote : "",
      content: meaningfulInvoiceContent(invoice),
    };
  }

  private async readPaymentCashAllocations(realmId: string, paymentId: string, accessToken: string, signal?: AbortSignal) {
    const url = new URL(`/v3/company/${encodeURIComponent(realmId)}/payment/${encodeURIComponent(paymentId)}`, this.config.apiBaseUrl);
    url.searchParams.set("minorversion", ACCOUNTING_MINOR_VERSION);
    const response = await this.request(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
      signal,
    });
    if (!response.ok) throw new Error("QuickBooks payment response was invalid");
    const payload = await response.json() as { Payment?: Record<string, unknown> };
    const payment = payload?.Payment;
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
    const response = await this.request(url, {
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
    const response = await this.request(this.config.taxApiBaseUrl, {
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
    if (!response.ok) throw new QboHttpError("QuickBooks tax calculation unavailable", response.status);
    const payload: unknown = await response.json().catch(() => null);
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
    const response = await this.request(TOKEN_URL, {
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
    if (!response.ok) {
      if (response.status === 400) {
        // Only OAuth's definitive invalid_grant changes connection health.
        // Malformed/transient responses remain retryable provider failures.
        const failure: unknown = await response.json().catch(() => null);
        if (failure && typeof failure === "object" && "error" in failure && failure.error === "invalid_grant") {
          throw new QboInvalidGrantError("QuickBooks token request failed");
        }
      }
      throw new Error("QuickBooks token request failed");
    }
    return parseTokens(await response.json(), receivedAt);
  }
}

function parseFrozenBody(body: string): unknown {
  try { return JSON.parse(body); } catch { throw new Error("QuickBooks customer body is not valid JSON"); }
}

function isQboTimestamp(value: string) {
  // Components are checked directly because Date.parse silently rolls Feb 30 or 24:00 into a later real moment.
  const m = QBO_TIMESTAMP.exec(value);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth
    && hour <= 23 && minute <= 59 && second <= 59
    && (m[7] === undefined || (Number(m[7]) <= 23 && Number(m[8]) <= 59));
}

const invalidCustomer = () => new Error("QuickBooks customer response was invalid");
const asObject = (v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

function parseCustomer(raw: unknown): QboCustomer {
  // Raw string values are kept as QuickBooks sent them; trim only decides emptiness.
  const required = (v: unknown) => { if (typeof v !== "string" || !v.trim()) throw invalidCustomer(); return v; };
  const optional = (v: unknown) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "string") throw invalidCustomer();
    return v.trim() ? v : null; // raw value kept so drift mirrors QuickBooks; trim only decides emptiness
  };
  const nested = (v: unknown) => {
    if (v === undefined || v === null) return {};
    const o = asObject(v);
    if (!o) throw invalidCustomer();
    return o;
  };
  const c = asObject(raw);
  if (!c || typeof c.Active !== "boolean") throw invalidCustomer();
  const updatedAt = asObject(c.MetaData)?.LastUpdatedTime;
  if (typeof updatedAt !== "string" || !isQboTimestamp(updatedAt)) throw invalidCustomer();
  const bill = nested(c.BillAddr);
  return {
    id: required(c.Id), displayName: required(c.DisplayName), companyName: optional(c.CompanyName),
    email: optional(nested(c.PrimaryEmailAddr).Address), phone: optional(nested(c.PrimaryPhone).FreeFormNumber),
    billAddress1: optional(bill.Line1), billAddress2: optional(bill.Line2), billCity: optional(bill.City),
    billState: optional(bill.CountrySubDivisionCode), billZip: optional(bill.PostalCode),
    active: c.Active, syncToken: required(c.SyncToken), updatedAt,
  };
}

/** An active Item as a picker record, or null for a Category (no invoice line can use one). */
function parseItem(raw: unknown): QboRecord | null {
  const row = asObject(raw);
  const name = row?.FullyQualifiedName ?? row?.Name;
  if (!row || typeof row.Id !== "string" || !row.Id.trim() || typeof name !== "string" || !name.trim() || typeof row.Type !== "string") {
    throw new Error("QuickBooks item response was invalid");
  }
  return row.Type === "Category" ? null : { id: row.Id, name };
}

/** Fault fields safe to keep: code and Message only (Detail can echo customer data), length-capped; never headers or credentials. */
function customerFault(payload: unknown) {
  const errors = asObject(asObject(payload)?.Fault)?.Error;
  const first = Array.isArray(errors) ? asObject(errors[0]) : null;
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  return { code: text(first?.code, 20), message: text(first?.Message, 200) };
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

function meaningfulInvoiceContentMatches(expectedInvoice: unknown, actual: Record<string, unknown>) {
  if (!expectedInvoice || typeof expectedInvoice !== "object" || Array.isArray(expectedInvoice)) return false;
  const expected = meaningfulInvoiceContent(expectedInvoice as Record<string, unknown>);
  return Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key]) === JSON.stringify(value));
}

export function qboConfig(env: Record<string, string | undefined> = process.env): QboConfig {
  try { return readQboEnv(env); } catch { throw new Error(QBO_SETUP_UNAVAILABLE); }
}

export function isQboConfigured(env: Record<string, string | undefined> = process.env) {
  try { readQboEnv(env); return true; } catch { return false; }
}
