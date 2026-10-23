import { describe, expect, it } from "vitest";
import { qboInvoicePresentation, qboMappingVersion, qboPushConfirmation } from "@/lib/mgr/qbo-ui";

describe("QuickBooks invoice presentation", () => {
  it("keeps an uncertain push on its exact retry", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pending", localPaidCents: 0, hasPendingPush: true }))
      .toEqual({ detail: "push result unknown · retry uses the same request", actions: ["retry"] });
  });

  it("requires a corrected attempt after a definitive mapping failure", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "push_failed", localPaidCents: 0, syncError: "QuickBooks item mapping required" }))
      .toEqual({ detail: "push failed · QuickBooks item mapping required", actions: ["fix_mapping", "corrected_push"] });
  });

  it("offers a new push only for a remotely deleted invoice", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["admin"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "deleted" }))
      .toEqual({ detail: "deleted in QuickBooks", actions: ["repush", "write_off"] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["admin"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "voided" }))
      .toEqual({ detail: "voided in QuickBooks · not paid", actions: ["write_off"] });
  });

  it("never offers invoice write-off for a credit memo", () => {
    expect(qboInvoicePresentation({ kind: "credit_memo", roles: ["admin"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "deleted" }))
      .toEqual({ detail: "deleted in QuickBooks", actions: ["repush"] });
    expect(qboInvoicePresentation({ kind: "credit_memo", roles: ["admin"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "voided" }))
      .toEqual({ detail: "voided in QuickBooks · not paid", actions: [] });
  });

  it("does not expose financial actions to Warehouse", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["warehouse"], connected: true, syncStatus: "pending", localPaidCents: 0 }))
      .toEqual({ detail: "not pushed", actions: [] });
  });

  it("distinguishes a partial payment from a merely pushed invoice", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "live", totalCents: 10000, balanceCents: 4000, cashCollectedCents: 6000 }))
      .toEqual({ detail: "partially paid in QuickBooks · $60.00 cash received · $40.00 due", actions: [] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "live", totalCents: 10000, balanceCents: 4000, cashCollectedCents: 0 }))
      .toEqual({ detail: "$40.00 due in QuickBooks · no cash payment recorded", actions: [] });
  });

  it("calls a zero-balance invoice paid only with positive cash evidence", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "live", balanceCents: 0, cashCollectedCents: 0 }))
      .toEqual({ detail: "settled in QuickBooks · no cash payment recorded", actions: [] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "live", balanceCents: 0, cashCollectedCents: 4000 }))
      .toEqual({ detail: "settled in QuickBooks · $40.00 cash received", actions: [] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pushed", localPaidCents: 0, remoteState: "live", totalCents: 10000, balanceCents: 0, cashCollectedCents: 10000 }))
      .toEqual({ detail: "paid in QuickBooks", actions: [], paidStatusShown: true });
  });

  it("keeps stored invoice status and local write-off available after disconnect", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["admin"], connected: false, syncStatus: "pushed", localPaidCents: 0, remoteState: "deleted" }))
      .toEqual({ detail: "deleted in QuickBooks", actions: ["write_off"] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["admin"], connected: false, syncStatus: "pushed", localPaidCents: 0, remoteState: "voided" }))
      .toEqual({ detail: "voided in QuickBooks · not paid", actions: ["write_off"] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: false, syncStatus: "pushed", localPaidCents: 0, remoteState: "live", accountantDrift: true }))
      .toEqual({ detail: "edited in QuickBooks · review there", actions: [] });
  });

  it("offers no QuickBooks push to any role while MGR holds an unvoided payment", () => {
    for (const roles of [["admin"], ["sales"], ["warehouse"]] as const) {
      // Push, corrected push and exact retry, in that order.
      for (const state of [{ syncStatus: "pending" }, { syncStatus: "push_failed" }, { syncStatus: "pending", hasPendingPush: true }] as const) {
        expect(qboInvoicePresentation({ kind: "invoice", roles, connected: true, ...state, localPaidCents: 2500 }))
          .toEqual({ detail: "Payments recorded in MGR · not sent to QuickBooks", actions: [] });
      }
    }
  });

  it("returns today's push actions once every MGR payment is voided (Q8)", () => {
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "pending", localPaidCents: 0 }))
      .toEqual({ detail: "ready to push", actions: ["push"] });
    expect(qboInvoicePresentation({ kind: "invoice", roles: ["sales"], connected: true, syncStatus: "push_failed", localPaidCents: 0 }))
      .toEqual({ detail: "push failed", actions: ["fix_mapping", "corrected_push"] });
  });

  it("names every remote-create confirmation and preserves exact-retry language", () => {
    for (const action of ["push", "retry", "corrected_push", "repush"] as const) {
      const confirmation = qboPushConfirmation(action, "INV-0042");
      expect(confirmation.title).toContain("INV-0042");
      expect(confirmation.confirmLabel).toMatch(/^Confirm/);
    }
    expect(qboPushConfirmation("retry", "INV-0042").detail).toMatch(/exact saved request/i);
  });

  it("changes a mapping form's version when the saved server value changes or clears", () => {
    expect(qboMappingVersion(null)).not.toBe(qboMappingVersion("QB-42"));
    expect(qboMappingVersion("QB-42")).not.toBe(qboMappingVersion(null));
  });
});
