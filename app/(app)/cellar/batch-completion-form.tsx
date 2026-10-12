"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBrewery, useCommandContext } from "@/lib/brewery-provider";
import { BatchCompletionView, type BatchCompletionPreview } from "@/components/mgr/views/batch-completion";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import {
  canCloseBatchCompletion,
  isCurrentBatchCompletionReview,
  type BatchCompletionPhase,
} from "@/lib/mgr/batch-completion-state";

type Batch = { id: string; label: string };


export function BatchCompletionForm({ batches }: { batches: Batch[] }) {
  const breweryId = useBrewery();
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [preview, setPreview] = useState<BatchCompletionPreview | null>(null);
  const [confirmInTank, setConfirmInTank] = useState(false);
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
    setConfirmInTank(false);
    setError(null);
    setPhase("loading");
    try {
      const next = await command(breweryId, "get_batch_completion_preview", { batchId: id }) as BatchCompletionPreview;
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
      setPreview(await command(breweryId, "complete_batch", { batchId: reviewedBatchId, confirmInTank }, requestId.current, expectedContext.current) as BatchCompletionPreview);
      requestId.current = null;
      setPhase("saved");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not complete this batch";
      setError(message);
      if (cause instanceof CommandResponseError && canRetireCommandFailure(cause.status, retrying, cause.code)) {
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
    setConfirmInTank(false);
    setBatchId(""); setPreview(null); setError(null); setPhase("idle"); requestId.current = null;
  }

  return <BatchCompletionView batches={batches} open={open} onOpenChange={changeOpen}
    batchId={batchId} preview={preview} phase={phase} error={error}
    confirmInTank={confirmInTank} onConfirmInTank={setConfirmInTank}
    onReview={review} onSubmit={submit} />;
}
