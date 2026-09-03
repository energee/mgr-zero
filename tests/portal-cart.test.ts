import { describe, expect, it } from "vitest";

import { submissionFailureMessage } from "@/app/(portal)/portal/cart";

describe("portal cart recovery", () => {
  it("does not claim an order is still a draft when submission may have committed", () => {
    expect(submissionFailureMessage("network failed", "order-id")).toBe(
      "Order saved, but submission could not be confirmed (network failed). View the order status before retrying, or contact the brewery.",
    );
    expect(submissionFailureMessage("network failed", null)).toBe("network failed");
  });
});
