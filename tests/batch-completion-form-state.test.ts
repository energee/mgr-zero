import { describe, expect, it } from "vitest";
import { canCloseBatchCompletion, isCurrentBatchCompletionReview } from "@/lib/mgr/batch-completion-state";

describe("batch completion form attempt ownership", () => {
  it("keeps an in-flight or unknown command open so its exact request can be recovered", () => {
    expect(canCloseBatchCompletion("submitting")).toBe(false);
    expect(canCloseBatchCompletion("unknown")).toBe(false);
    expect(canCloseBatchCompletion("ready")).toBe(true);
    expect(canCloseBatchCompletion("saved")).toBe(true);
  });

  it("accepts a preview only for the latest request and selected batch", () => {
    expect(isCurrentBatchCompletionReview(2, 2, "batch-b", "batch-b")).toBe(true);
    expect(isCurrentBatchCompletionReview(1, 2, "batch-a", "batch-b")).toBe(false);
    expect(isCurrentBatchCompletionReview(2, 2, "batch-a", "batch-b")).toBe(false);
  });
});
