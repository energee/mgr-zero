import { describe, expect, it } from "vitest";

import { submissionFailureMessage } from "@/app/(portal)/portal/cart";

describe("portal cart recovery", () => {
  it("directs a saved draft to brewery staff because portal order detail is read-only", () => {
    expect(submissionFailureMessage("network failed", "order-id")).toBe(
      "Order saved as a draft (network failed). Retry Submit order here, or contact the brewery.",
    );
    expect(submissionFailureMessage("network failed", null)).toBe("network failed");
  });
});
