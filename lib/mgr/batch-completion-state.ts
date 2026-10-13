import { bblExact } from "@/lib/volume";

/** Names the physical beer being written off when the server says it needs acknowledgement. */
export function batchCompletionAcknowledgement(preview: {
  inTankRequiresConfirmation?: boolean; inTank?: { vesselName: string; bbl: number }[];
}) {
  // Pre-upgrade saved receipts carry neither field and need no acknowledgement.
  if (!preview.inTankRequiresConfirmation || !preview.inTank) return null;
  return `Write off ${preview.inTank.map(tank => `${bblExact(tank.bbl, 8)} in ${tank.vesselName}`).join(" and ")} as loss`;
}

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
