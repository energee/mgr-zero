import { describe, expect, it } from "vitest";

import { submissionFailureMessage } from "@/app/(portal)/portal/cart";
import { cartActionsDisabled, planDraftSync } from "@/lib/portal-cart";

describe("portal cart recovery", () => {
  it("does not claim an order is still a draft when submission may have committed", () => {
    expect(submissionFailureMessage("network failed", "order-id")).toBe(
      "Order saved, but submission could not be confirmed (network failed). View the order status before retrying, or contact the brewery.",
    );
    expect(submissionFailureMessage("network failed", null)).toBe("network failed");
  });
});

describe("portal cart draft sync", () => {
  it("creates a draft when none exists yet", () => {
    expect(planDraftSync(null)).toEqual({ command: "portal_create_order" });
  });

  it("replaces the saved draft's lines when a draft already exists, never reusing stale lines", () => {
    expect(planDraftSync("order-id")).toEqual({ command: "portal_update_draft_order", orderId: "order-id" });
  });

  it("disables both buttons without a ship-to, without a positive line, or while busy — even with a saved draft", () => {
    expect(cartActionsDisabled({ shipToId: "s", lineCount: 1, busy: false })).toBe(false);
    expect(cartActionsDisabled({ shipToId: "", lineCount: 1, busy: false })).toBe(true);
    expect(cartActionsDisabled({ shipToId: "s", lineCount: 0, busy: false })).toBe(true);
    expect(cartActionsDisabled({ shipToId: "s", lineCount: 1, busy: true })).toBe(true);
  });
});
