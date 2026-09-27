import { formatDateTime } from "@/lib/date-format";
import { disconnectStatus } from "@/lib/mgr/integration-disconnect";
export type QboHealth = { connected: boolean; connectionId?: string; state: "connected" | "disconnected" | "recovery_required"; realmLabel: string | null; realmId?: string; remoteRevocationState?: string; lastError: string | null; accessExpiresAt?: string | null; allowAch?: boolean; allowCard?: boolean };
export type AccountingViewModel = {
  connected: boolean; canDisconnect: boolean; company: string; status: string; reconnect: boolean; error?: string | null; access?: string;
  syncStatus?: QboSyncStatus;
  defaults?: { allowAch: boolean; allowCard: boolean }; missingEmails?: number; remoteRevocationUnresolved: boolean;
  backHref?: string; disconnectHref?: string; mappingsHref?: string; customersHref?: string;
};
export function toAccountingViewProps(health: QboHealth): AccountingViewModel {
  return {
    connected: health.connected && health.state === "connected", canDisconnect: disconnectStatus(health) === "available",
    company: health.realmLabel ?? "QuickBooks Online", status: `${health.state.replaceAll("_", " ")}${health.realmId ? ` · company ${health.realmId}` : ""}`,
    reconnect: Boolean(health.connectionId), error: health.lastError,
    access: health.accessExpiresAt ? `renews automatically · current token expires ${health.accessExpiresAt.slice(0, 10)}` : undefined,
    defaults: typeof health.allowAch === "boolean" && typeof health.allowCard === "boolean" ? { allowAch: health.allowAch, allowCard: health.allowCard } : undefined,
    remoteRevocationUnresolved: disconnectStatus(health) === "unresolved",
  };
}

export type QboSyncStatus = {
  latest: { at: string; operator: string; completed: boolean; superseded?: boolean } | null;
  lastSuccess: { at: string; operator: string } | null;
  latestFailure: { at: string; operator: string; error: string } | null;
  retryRequestId: string | null;
};

/** Format the three independent sync facts in the active brewery's time zone. */
export function toQboSyncViewProps(status: QboSyncStatus, timeZone: string): QboSyncStatus {
  return {
    ...status,
    latest: status.latest && { ...status.latest, at: formatDateTime(status.latest.at, timeZone) },
    lastSuccess: status.lastSuccess && { ...status.lastSuccess, at: formatDateTime(status.lastSuccess.at, timeZone) },
    latestFailure: status.latestFailure && { ...status.latestFailure, at: formatDateTime(status.latestFailure.at, timeZone) },
  };
}
