// Interactive inventory adapter for the same completion surface used by the live cellar.
"use client";

import { useState } from "react";
import { BatchCompletionView, type BatchCompletionPreview } from "@/components/mgr/views/batch-completion";
import type { BatchCompletionPhase } from "@/lib/mgr/batch-completion-state";

const preview: BatchCompletionPreview = {
  batchId: "batch-0168", closedAt: null, baselineBbl: 15, packagedBbl: 11.8,
  attributedBbl: 0, residualBbl: 3.2, thresholdBbl: 0.075, adjustmentId: null,
  inTankBbl: 3.2, inTank: [{ occupancyId: "occupancy-0168", vesselId: "fv-2", vesselName: "FV-2", bbl: 3.2 }],
};

export function BatchCompletionFixture() {
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<BatchCompletionPhase>("idle");
  return <BatchCompletionView batches={[{ id: preview.batchId, label: "BATCH-0168" }]} open={open}
    onOpenChange={next => { setOpen(next); if (!next) { setBatchId(""); setConfirmed(false); setPhase("idle"); } }}
    batchId={batchId} preview={batchId ? preview : null} phase={phase} error={null}
    confirmInTank={confirmed} onConfirmInTank={setConfirmed}
    onReview={id => { setBatchId(id); setConfirmed(false); setPhase("ready"); }}
    onSubmit={event => { event.preventDefault(); if (confirmed) setPhase("saved"); }} />;
}
