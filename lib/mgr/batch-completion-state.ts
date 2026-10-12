import { bblExact } from "@/lib/volume";

/** Names the physical beer being written off; below-threshold residue needs no acknowledgement. */
export function batchCompletionAcknowledgement(preview: {
  inTankBbl: number; thresholdBbl: number; inTank: { vesselName: string; bbl: number }[];
}) {
  if (preview.inTankBbl < preview.thresholdBbl) return null;
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
