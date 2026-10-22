import { formatDate, formatDateTime } from "@/lib/date-format";
import { disconnectStatus } from "@/lib/mgr/integration-disconnect";
import { connectionStateLabel } from "@/lib/mgr/labels";
export type QboHealth = { connected: boolean; connectionId?: string; state: "connected" | "disconnected" | "recovery_required"; realmLabel: string | null; realmId?: string; remoteRevocationState?: string; lastError: string | null; accessExpiresAt?: string | null; allowAch?: boolean; allowCard?: boolean; purchaseAccountId?: string | null };
export type QboEnvironment = "sandbox" | "production";
export type QboMappingKind = "customer" | "item" | "deposit" | "one_way_fee" | "vendor" | "purchase_account";
export type QboMappingSection = {
  title?: string; empty?: string;
  rows: { id: string; label: string; kind: QboMappingKind; currentId?: string | null; detail?: string }[];
};
export type AccountingViewModel = {
  connected: boolean; canDisconnect: boolean; company: string; status: string;
  /** Health carries a connectionId, so MGR has connected this brewery before: the button reads Reconnect QuickBooks. */
  reconnect: boolean;
  error?: string | null; access?: string;
  /** QuickBooks realm id, shown as its own fact. */
  companyId?: string;
  syncStatus?: QboSyncStatus;
  defaults?: { allowAch: boolean; allowCard: boolean }; missingEmails?: number; remoteRevocationUnresolved: boolean;
  backHref?: string; disconnectHref?: string; mappingsHref?: string; customersHref?: string;
};
/** Intuit's sandbox API host is the only way a deployment talks to sandbox companies; any other host is production. */
export function qboEnvironment(apiBaseUrl: string): QboEnvironment {
  return new URL(apiBaseUrl).hostname.startsWith("sandbox-") ? "sandbox" : "production";
}

/** The stored QuickBooks CompanyName, or null. Connections made before CompanyName was stored (PR #822) carry the realm id as their label; that is not a name. Pass realmId so that case is detected. */
export function qboCompanyName(health: { realmLabel: string | null; realmId?: string }) {
  return health.realmLabel && health.realmLabel !== health.realmId ? health.realmLabel : null;
}

/** timeZone: breweries.timezone, the day the token expires in. missingEmails: count_customers_missing_portal_email, when the caller read it. environment: qboEnvironment(QBO_API_BASE), when configured. */
export function toAccountingViewProps(health: QboHealth, timeZone: string, missingEmails?: number, environment?: QboEnvironment): AccountingViewModel {
  const name = qboCompanyName(health);
  return {
    connected: health.connected && health.state === "connected", canDisconnect: disconnectStatus(health) === "available",
    company: name ?? "QuickBooks Online", status: `${connectionStateLabel(health.state)}${health.realmId && environment ? ` · ${environment}` : ""}`,
    companyId: health.realmId,
    reconnect: Boolean(health.connectionId), error: health.lastError,
    access: health.accessExpiresAt ? `renews automatically · current token expires ${formatDate(health.accessExpiresAt, timeZone)}` : undefined,
    defaults: typeof health.allowAch === "boolean" && typeof health.allowCard === "boolean" ? { allowAch: health.allowAch, allowCard: health.allowCard } : undefined,
    missingEmails, remoteRevocationUnresolved: disconnectStatus(health) === "unresolved",
  };
}

export type QboSyncStatus = {
  latest: { at: string; operator: string; completed: boolean; superseded?: boolean } | null;
  lastSuccess: { at: string; operator: string } | null;
  latestFailure: { at: string; operator: string } | null;
  retryRequestId: string | null;
};

/** Format the three independent sync facts in the active brewery's time zone. */
export function toQboSyncViewProps(status: QboSyncStatus, timeZone: string): QboSyncStatus {
  const local = <T extends { at: string }>(fact: T | null) => fact && { ...fact, at: formatDateTime(fact.at, timeZone) };
  return { ...status, latest: local(status.latest), lastSuccess: local(status.lastSuccess), latestFailure: local(status.latestFailure) };
}
