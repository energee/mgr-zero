import { describe, expect, it } from "vitest";
import { qboInvoicePresentation } from "@/lib/mgr/qbo-ui";

describe("QuickBooks invoice presentation", () => {
  it("keeps an uncertain push on its exact retry", () => {
    expect(qboInvoicePresentation({ role: "sales", connected: true, syncStatus: "pending", hasPendingPush: true }))
      .toEqual({ detail: "push result unknown · retry uses the same request", actions: ["retry"] });
  });

  it("requires a corrected attempt after a definitive mapping failure", () => {
    expect(qboInvoicePresentation({ role: "sales", connected: true, syncStatus: "push_failed", syncError: "QuickBooks item mapping required" }))
      .toEqual({ detail: "push failed · QuickBooks item mapping required", actions: ["fix_mapping", "corrected_push"] });
  });

  it("offers a new push only for a remotely deleted invoice", () => {
    expect(qboInvoicePresentation({ role: "admin", connected: true, syncStatus: "pushed", remoteState: "deleted" }))
      .toEqual({ detail: "deleted in QuickBooks", actions: ["repush", "write_off"] });
    expect(qboInvoicePresentation({ role: "admin", connected: true, syncStatus: "pushed", remoteState: "voided" }))
      .toEqual({ detail: "voided in QuickBooks · not paid", actions: ["write_off"] });
  });

  it("does not expose financial actions to Warehouse", () => {
    expect(qboInvoicePresentation({ role: "warehouse", connected: true, syncStatus: "pending" }))
      .toEqual({ detail: "not pushed", actions: [] });
  });
});
