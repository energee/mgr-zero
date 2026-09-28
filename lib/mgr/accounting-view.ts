import { formatDateTime } from "@/lib/date-format";
import { disconnectStatus } from "@/lib/mgr/integration-disconnect";
export type QboHealth = { connected: boolean; connectionId?: string; state: "connected" | "disconnected" | "recovery_required"; realmLabel: string | null; realmId?: string; remoteRevocationState?: string; lastError: string | null; accessExpiresAt?: string | null; allowAch?: boolean; allowCard?: boolean };
export type AccountingViewModel = {
  connected: boolean; canDisconnect: boolean; company: string; status: string; reconnect: boolean; error?: string | null; access?: string;
  syncStatus?: QboSyncStatus;
  defaults?: { allowAch: boolean; allowCard: boolean }; missingEmails?: number; remoteRevocationUnresolved: boolean;
  backHref?: string; disconnectHref?: string; mappingsHref?: string; customersHref?: string;
};
/** missingEmails: count_customers_missing_portal_email, when the caller read it. */
export function toAccountingViewProps(health: QboHealth, missingEmails?: number): AccountingViewModel {
  return {
    connected: health.connected && health.state === "connected", canDisconnect: disconnectStatus(health) === "available",
    company: health.realmLabel ?? "QuickBooks Online", status: `${health.state.replaceAll("_", " ")}${health.realmId ? ` · company ${health.realmId}` : ""}`,
    reconnect: Boolean(health.connectionId), error: health.lastError,
    access: health.accessExpiresAt ? `renews automatically · current token expires ${health.accessExpiresAt.slice(0, 10)}` : undefined,
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
