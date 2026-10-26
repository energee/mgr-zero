import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchCompletionView, type BatchCompletionPreview } from "@/components/mgr/views/batch-completion";
import { canCloseBatchCompletion, isCurrentBatchCompletionReview, batchCompletionAcknowledgement } from "@/lib/mgr/batch-completion-state";

describe("batch completion form attempt ownership", () => {
  it("#1401 announces a saved completion neutrally", () => {
    const view = BatchCompletionView({
      batches: [], open: true, onOpenChange: () => {}, batchId: "", preview: null, phase: "saved", error: null,
      confirmInTank: false, onConfirmInTank: () => {}, onReview: () => {}, onSubmit: () => {},
    });
    function status(node: ReactNode): ReactNode {
      if (Array.isArray(node)) return node.map(status);
      if (!isValidElement<{ role?: string; children?: ReactNode }>(node)) return null;
      return node.props.role === "status" ? node : status(node.props.children);
    }
    const html = renderToStaticMarkup(status(view));
    expect(html).toContain('role="status"');
    expect(html).toContain("Batch completed and saved.");
    expect(html).not.toContain("text-warning-foreground");
  });

  it("renders a recovered pre-upgrade receipt without asking to acknowledge saved tank metadata", () => {
    const legacyReceipt = {
      batchId: "batch", closedAt: "2026-10-12T00:00:00Z", baselineBbl: 10,
      packagedBbl: 9.5, attributedBbl: 0, residualBbl: 0.5, thresholdBbl: 0.05, adjustmentId: "adjustment",
    } as BatchCompletionPreview;
    expect(() => BatchCompletionView({
      batches: [{ id: "batch", label: "Batch" }], open: true, onOpenChange: () => {},
      batchId: "batch", preview: legacyReceipt, phase: "saved", error: null,
      confirmInTank: false, onConfirmInTank: () => {}, onReview: () => {}, onSubmit: () => {},
    })).not.toThrow();
  });
  it("keeps completion controls local instead of suppressing their inventory dialog trigger", () => {
    const view = BatchCompletionView({
      batches: [], open: false, onOpenChange: () => {}, batchId: "", preview: null, phase: "idle", error: null,
      confirmInTank: false, onConfirmInTank: () => {}, onReview: () => {}, onSubmit: () => {},
    });
    expect(view.props).toHaveProperty("data-preview-action");
  });
  it("names the exact beer and tanks being acknowledged at the threshold", () => {
    expect(batchCompletionAcknowledgement({ inTankRequiresConfirmation: true, inTank: [{ vesselName: "FV-2", bbl: 3.2 }] })).toBe("Write off 3.2 bbl in FV-2 as loss");
    expect(batchCompletionAcknowledgement({ inTankRequiresConfirmation: true, inTank: [{ vesselName: "BT-1", bbl: 0.03 }, { vesselName: "FV-2", bbl: 0.02 }] })).toBe("Write off 0.03 bbl in BT-1 and 0.02 bbl in FV-2 as loss");
    expect(batchCompletionAcknowledgement({ inTankRequiresConfirmation: false, inTank: [{ vesselName: "FV-2", bbl: 0.04 }] })).toBeNull();
    expect(batchCompletionAcknowledgement({})).toBeNull();
  });
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
