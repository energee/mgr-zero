// Shared completion surface: inventory supplies fixtures, live supplies ledger previews and commands.
"use client";

import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { batchCompletionAcknowledgement, type BatchCompletionPhase } from "@/lib/mgr/batch-completion-state";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { submitReason } from "@/lib/mgr/submit-reason";
import { bblExact } from "@/lib/volume";

export type BatchCompletionPreview = {
  batchId: string; closedAt: string | null; baselineBbl: number; packagedBbl: number;
  attributedBbl: number; residualBbl: number; thresholdBbl: number; adjustmentId: string | null;
  inTankBbl: number; inTankRequiresConfirmation: boolean; inTank: { occupancyId: string; vesselId: string; vesselName: string; bbl: number }[];
};

export function BatchCompletionView({ batches, open, onOpenChange, batchId, preview, phase, error,
  confirmInTank, onConfirmInTank, onReview, onSubmit,
}: {
  batches: { id: string; label: string }[]; open: boolean; onOpenChange: (open: boolean) => void;
  batchId: string; preview: BatchCompletionPreview | null; phase: BatchCompletionPhase; error: string | null;
  confirmInTank: boolean; onConfirmInTank: (checked: boolean) => void;
  onReview: (id: string) => void; onSubmit: (event: React.FormEvent) => void;
}) {
  const none = batches.length === 0;
  const frozen = phase === "loading" || phase === "submitting" || phase === "unknown" || phase === "saved";
  // Saved pre-upgrade receipts deliberately retain their original shape without tank metadata.
  const acknowledgement = preview && phase !== "saved" && batchCompletionAcknowledgement(preview);
  // A batch, then the write-off switch. Nothing while the preview loads: the loading line already says so.
  const missing: string[] = [];
  if (!batchId) missing.push("a batch");
  else if (acknowledgement && !confirmInTank) missing.push(`the “${acknowledgement}” switch turned on`);
  const reason = phase === "loading" ? null : submitReason(missing);
  return <div data-preview-action className="flex flex-col items-start gap-2"><CommandForm open={open} onOpenChange={onOpenChange} title="Complete batch"
    trigger={<Button variant="outline" disabled={none} aria-describedby={none ? "completion-none" : undefined}>Complete batch</Button>}>
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {E.pick("Batch", batchId, [{ value: "", label: "Batch to complete" }, ...batches.map(batch => ({ value: batch.id, label: batch.label }))], { onChange: onReview, disabled: frozen })}
      {phase === "loading" && <p className="text-sm text-muted-foreground">Calculating from the cellar ledger...</p>}
      {preview && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt>Baseline</dt><dd className="text-right">{bblExact(preview.baselineBbl, 8)}</dd>
        <dt>Frozen packaged</dt><dd className="text-right">{bblExact(preview.packagedBbl, 8)}</dd>
        <dt>Prior attributed</dt><dd className="text-right">{bblExact(preview.attributedBbl, 8)}</dd>
        <dt>Threshold</dt><dd className="text-right">{bblExact(preview.thresholdBbl, 8)}</dd>
        <dt>Predicted residual</dt><dd className="text-right">{bblExact(preview.residualBbl, 8)}</dd>
      </dl>}
      {preview && phase !== "saved" && <p className="text-xs text-muted-foreground">Completing closes every open occupancy. A residual at or above the threshold becomes one automatic loss reconciliation.</p>}
      {acknowledgement && <div className="flex items-center justify-between gap-3"><span>{acknowledgement}</span><fieldset disabled={frozen}>{E.sw(confirmInTank, acknowledgement, onConfirmInTank)}</fieldset></div>}
      {phase === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The batch and request are frozen; retry unchanged to recover the original result.</CommandFormMessage>}
      {phase === "saved" && <CommandFormMessage tone="warning">Batch completed and saved.</CommandFormMessage>}
      <CommandFormMessage error={error} />
      <CommandFormFooter><IrreversibleSubmit label={phase === "unknown" ? "Retry unchanged completion" : phase === "saved" ? "Batch completed" : "Complete batch"}
        reason={reason} submitting={phase === "submitting"} busy="Completing..." disabled={!preview || phase === "saved"} /></CommandFormFooter>
    </form>
  </CommandForm>{none && <p id="completion-none" className="text-xs text-muted-foreground">No brewed batch is open to complete.</p>}</div>;
}
