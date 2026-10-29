import type { AccountingViewModel, QboMappingSection } from "@/lib/mgr/accounting-view";

export const accountingExpired: AccountingViewModel = {
  connected: false, canDisconnect: true, company: "Demo Brewing LLC", status: "Reconnect required · production", companyId: "9341", reconnect: true,
  error: "QuickBooks authorization expired. Push, payment links and paid-date sync are paused.",
  syncStatus: {
    latest: { at: "Sep 27, 2026, 10:30 AM", operator: "alex@example.test", completed: false },
    lastSuccess: { at: "Sep 26, 2026, 11:00 AM", operator: "alex@example.test" },
    latestFailure: { at: "Sep 27, 2026, 10:31 AM", operator: "alex@example.test" },
    retryRequestId: "fixture-request",
  },
  defaults: { allowAch: true, allowCard: true }, missingEmails: 2, remoteRevocationUnresolved: false,
};

export const quickBooksMappings: QboMappingSection[] = [
  { title: "Customers", rows: [{ id: "customer", label: "Oak and Barrel", kind: "customer", currentId: "184" }] },
  { title: "SKUs", rows: [{ id: "sku", label: "Pils · case", kind: "item", currentId: "307" }] },
  { title: "Vendors", rows: [{ id: "vendor", label: "Fictional Malt Supply", kind: "vendor", currentId: "512" }] },
  { title: "Receipt Bills", rows: [{ id: "purchase_account", label: "Purchase account", kind: "purchase_account", currentId: "84", detail: "One brewery-wide QuickBooks account for receipt Bills" }] },
  { title: "Returnable-keg deposits", rows: [{ id: "deposit", label: "Deposit and refund item", kind: "deposit", detail: "One verified QuickBooks item for frozen keg charges and refunds" }] },
  { title: "One-way kegs", rows: [{ id: "one_way_fee", label: "One-way keg fee item", kind: "one_way_fee", detail: "One verified QuickBooks item for the non-refundable one-way keg fee" }] },
];
