"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import {
  canCloseBatchCompletion,
  isCurrentBatchCompletionReview,
  type BatchCompletionPhase,
} from "@/lib/mgr/batch-completion-state";

type Batch = { id: string; label: string };
type Preview = {
  batchId: string; closedAt: string | null; baselineBbl: number; packagedBbl: number;
  attributedBbl: number; residualBbl: number; thresholdBbl: number; adjustmentId: string | null;
};
const bbl = (value: number) => `${Number(value)} bbl`;

export function BatchCompletionForm({ batches }: { batches: Batch[] }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phase, setPhase] = useState<BatchCompletionPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const reviewSequence = useRef(0);
  const selectedBatchId = useRef("");

  async function review(id: string) {
    const startedReview = ++reviewSequence.current;
    selectedBatchId.current = id;
    setBatchId(id);
    setPreview(null);
    setError(null);
    setPhase("loading");
    try {
      const next = await command(breweryId, "get_batch_completion_preview", { batchId: id }) as Preview;
      if (!isCurrentBatchCompletionReview(startedReview, reviewSequence.current, id, selectedBatchId.current)) return;
      setPreview(next);
      setPhase("ready");
    } catch (cause) {
      if (startedReview !== reviewSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Could not review this batch");
      setPhase("idle");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || preview.batchId !== batchId) return;
    const reviewedBatchId = preview.batchId;
    const retrying = phase === "unknown";
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setError(null);
    setPhase("submitting");
    try {
      setPreview(await command(breweryId, "complete_batch", { batchId: reviewedBatchId }, requestId.current) as Preview);
      requestId.current = null;
      setPhase("saved");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not complete this batch";
      setError(message);
      if (cause instanceof CommandResponseError && canRetireCommandFailure(cause.status, retrying)) {
        requestId.current = null;
        setPhase("ready");
      } else {
        setPhase("unknown");
      }
    }
  }

  function changeOpen(next: boolean) {
    if (!next && !canCloseBatchCompletion(phase)) return;
    setOpen(next);
    if (next) return;
    reviewSequence.current += 1;
    selectedBatchId.current = "";
    if (phase === "saved") router.refresh();
    setBatchId(""); setPreview(null); setError(null); setPhase("idle"); requestId.current = null;
  }

  return <CommandForm open={open} onOpenChange={changeOpen} title="Complete batch" trigger={<Button size="sm" variant="outline" disabled={batches.length === 0}>Complete batch</Button>}>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="completion-batch">Batch</Label>
        <Select value={batchId} onValueChange={review} disabled={phase === "loading" || phase === "submitting" || phase === "unknown" || phase === "saved"}>
          <SelectTrigger id="completion-batch"><SelectValue placeholder="Batch to complete" /></SelectTrigger>
          <SelectContent>{batches.map((batch) => <SelectItem key={batch.id} value={batch.id}>{batch.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {phase === "loading" && <p className="text-sm text-muted-foreground">Calculating from the cellar ledger…</p>}
      {preview && <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Baseline</dt><dd className="text-right">{bbl(preview.baselineBbl)}</dd>
        <dt className="text-muted-foreground">Frozen packaged</dt><dd className="text-right">{bbl(preview.packagedBbl)}</dd>
        <dt className="text-muted-foreground">Prior attributed</dt><dd className="text-right">{bbl(preview.attributedBbl)}</dd>
        <dt className="text-muted-foreground">Threshold</dt><dd className="text-right">{bbl(preview.thresholdBbl)}</dd>
        <dt className="font-medium">Predicted residual</dt><dd className="text-right font-medium">{bbl(preview.residualBbl)}</dd>
      </dl>}
      {preview && phase !== "saved" && <p className="text-xs text-muted-foreground">Completing closes every open occupancy for this batch. A residual at or above the threshold becomes one automatic loss reconciliation.</p>}
      {phase === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The batch and request are frozen; retry unchanged to recover the original result.</CommandFormMessage>}
      {phase === "saved" && <CommandFormMessage tone="warning">Batch completed and saved.</CommandFormMessage>}
      <CommandFormMessage error={error} />
      <CommandFormFooter>
        <Button data-variant="irreversible" type="submit" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={!preview || phase === "submitting" || phase === "saved"}>
          {phase === "unknown" ? "Retry unchanged completion" : phase === "submitting" ? "Completing…" : phase === "saved" ? "Batch completed" : "Complete batch"}
        </Button>
      </CommandFormFooter>
    </form>
  </CommandForm>;
}
