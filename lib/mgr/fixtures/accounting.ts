import type { AccountingViewModel } from "@/lib/mgr/accounting-view";

export const accountingExpired: AccountingViewModel = {
  connected: false, canDisconnect: true, company: "Demo Brewing LLC", status: "authorization expired · company 9341", reconnect: true,
  error: "QuickBooks authorization expired. Push, payment links and paid-date sync are paused.",
  syncStatus: {
    latest: { at: "Sep 27, 2026, 10:30 AM", operator: "alex@example.test", completed: false },
    lastSuccess: { at: "Sep 26, 2026, 11:00 AM", operator: "alex@example.test" },
    latestFailure: { at: "Sep 27, 2026, 10:31 AM", operator: "alex@example.test" },
    retryRequestId: "fixture-request",
  },
  defaults: { allowAch: true, allowCard: true }, missingEmails: 2, remoteRevocationUnresolved: false,
};
