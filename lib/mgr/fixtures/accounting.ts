import type { AccountingViewModel } from "@/lib/mgr/accounting-view";

export const accountingExpired: AccountingViewModel = {
  connected: false, canDisconnect: true, disconnectUnavailable: false, company: "Demo Brewing LLC", status: "authorization expired · company 9341", reconnect: true,
  error: "QuickBooks authorization expired. Push, payment links and paid-date sync are paused.",
  defaults: { allowAch: true, allowCard: true }, missingEmails: 2, remoteRevocationUnresolved: false,
};
