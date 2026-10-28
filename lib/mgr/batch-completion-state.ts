import { bblExact } from "@/lib/volume";

/** Names the physical beer being written off when the server says it needs acknowledgement. */
export function batchCompletionAcknowledgement(preview: {
  inTankRequiresConfirmation?: boolean; inTank?: { vesselName: string; bbl: number }[];
}) {
  // Pre-upgrade saved receipts carry neither field and need no acknowledgement.
  if (!preview.inTankRequiresConfirmation || !preview.inTank) return null;
  return `Write off ${preview.inTank.map(tank => `${bblExact(tank.bbl, 8)} in ${tank.vesselName}`).join(" and ")} as loss`;
}

/** Complete batch's one headline: the barrels its residual writes off as loss, which
 *  complete_batch does at or above the threshold, else none and why (#1508). */
export function completionLoss({ residualBbl, thresholdBbl }: { residualBbl: number; thresholdBbl: number }) {
  return residualBbl >= thresholdBbl
    ? `Loss written off: ${bblExact(residualBbl, 3)}`
    : `Loss written off: none (${bblExact(residualBbl, 3)} is under the ${bblExact(thresholdBbl, 3)} threshold)`;
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
