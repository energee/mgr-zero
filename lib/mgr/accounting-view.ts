export type QboHealth = { connected: boolean; connectionId?: string; state: "connected" | "disconnected" | "recovery_required"; realmLabel: string | null; realmId?: string; remoteRevocationState?: string; lastError: string | null; accessExpiresAt?: string | null; allowAch?: boolean; allowCard?: boolean };
export type AccountingViewModel = {
  connected: boolean; canDisconnect: boolean; disconnectUnavailable: boolean; company: string; status: string; reconnect: boolean; error?: string | null; access?: string;
  defaults?: { allowAch: boolean; allowCard: boolean }; missingEmails?: number; remoteRevocationUnresolved: boolean;
  backHref?: string; disconnectHref?: string; mappingsHref?: string; customersHref?: string;
};
export function toAccountingViewProps(health: QboHealth): AccountingViewModel {
  return {
    connected: health.connected && health.state === "connected", canDisconnect: Boolean(health.connectionId) && health.connected && health.state === "connected", disconnectUnavailable: health.state === "recovery_required",
    company: health.realmLabel ?? "QuickBooks Online", status: `${health.state.replaceAll("_", " ")}${health.realmId ? ` · company ${health.realmId}` : ""}`,
    reconnect: Boolean(health.connectionId), error: health.lastError,
    access: health.accessExpiresAt ? `renews automatically · current token expires ${health.accessExpiresAt.slice(0, 10)}` : undefined,
    defaults: typeof health.allowAch === "boolean" && typeof health.allowCard === "boolean" ? { allowAch: health.allowAch, allowCard: health.allowCard } : undefined,
    remoteRevocationUnresolved: health.remoteRevocationState === "unresolved",
  };
}
