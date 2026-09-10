import { describe, expect, it } from "vitest";
import { qboInvoicePresentation } from "@/lib/mgr/qbo-ui";

describe("QuickBooks invoice presentation", () => {
  it("keeps an uncertain push on its exact retry", () => {
    expect(qboInvoicePresentation({ kind: "invoice", role: "sales", connected: true, syncStatus: "pending", hasPendingPush: true }))
      .toEqual({ detail: "push result unknown · retry uses the same request", actions: ["retry"] });
  });

  it("requires a corrected attempt after a definitive mapping failure", () => {
    expect(qboInvoicePresentation({ kind: "invoice", role: "sales", connected: true, syncStatus: "push_failed", syncError: "QuickBooks item mapping required" }))
      .toEqual({ detail: "push failed · QuickBooks item mapping required", actions: ["fix_mapping", "corrected_push"] });
  });

  it("offers a new push only for a remotely deleted invoice", () => {
    expect(qboInvoicePresentation({ kind: "invoice", role: "admin", connected: true, syncStatus: "pushed", remoteState: "deleted" }))
      .toEqual({ detail: "deleted in QuickBooks", actions: ["repush", "write_off"] });
    expect(qboInvoicePresentation({ kind: "invoice", role: "admin", connected: true, syncStatus: "pushed", remoteState: "voided" }))
      .toEqual({ detail: "voided in QuickBooks · not paid", actions: ["write_off"] });
  });

  it("never offers invoice write-off for a credit memo", () => {
    expect(qboInvoicePresentation({ kind: "credit_memo", role: "admin", connected: true, syncStatus: "pushed", remoteState: "deleted" }))
      .toEqual({ detail: "deleted in QuickBooks", actions: ["repush"] });
    expect(qboInvoicePresentation({ kind: "credit_memo", role: "admin", connected: true, syncStatus: "pushed", remoteState: "voided" }))
      .toEqual({ detail: "voided in QuickBooks · not paid", actions: [] });
  });

  it("does not expose financial actions to Warehouse", () => {
    expect(qboInvoicePresentation({ kind: "invoice", role: "warehouse", connected: true, syncStatus: "pending" }))
      .toEqual({ detail: "not pushed", actions: [] });
  });

  it("distinguishes a partial payment from a merely pushed invoice", () => {
    expect(qboInvoicePresentation({ kind: "invoice", role: "sales", connected: true, syncStatus: "pushed", remoteState: "live", totalCents: 10000, balanceCents: 4000 }))
      .toEqual({ detail: "partially paid in QuickBooks · $40.00 due", actions: [] });
  });
});
