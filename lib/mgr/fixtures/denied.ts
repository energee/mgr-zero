// lib/mgr/fixtures/denied.ts — Permission denied snapshot (brewer, invoices).
import type { DeniedViewModel } from "@/lib/mgr/denied-view";

export const deniedInvoices: DeniedViewModel = {
  note: "You do not have access to Invoices.",
  signedInAs: "@dave · brewer",
  needs: "admin or sales",
  hint: "An admin can change your role in Settings, then Team.",
};
