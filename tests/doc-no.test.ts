// tests/doc-no.test.ts — document labels (lib/mgr/doc-no.ts).
import { describe, expect, it } from "vitest";
import { batchLabel } from "@/lib/mgr/doc-no";

describe("batchLabel", () => {
  it("names the batch number and its brand, as the vessel and batch pages print it (#1508)", () => {
    expect(batchLabel(3, "Hazy IPA")).toBe("B-0003 · Hazy IPA");
    expect(batchLabel(3, null)).toBe("B-0003 · no brand");
    expect(batchLabel(null, "Hazy IPA")).toBe("Batch · Hazy IPA");
  });
});
