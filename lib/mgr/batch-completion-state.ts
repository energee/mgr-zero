export type BatchCompletionPhase = "idle" | "loading" | "ready" | "submitting" | "unknown" | "saved";

export function canCloseBatchCompletion(phase: BatchCompletionPhase) {
  return phase !== "submitting" && phase !== "unknown";
}

export function isCurrentBatchCompletionReview(
  startedReview: number,
  latestReview: number,
  reviewedBatchId: string,
  selectedBatchId: string,
) {
  return startedReview === latestReview && reviewedBatchId === selectedBatchId;
}
