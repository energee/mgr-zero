"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandForm } from "@/components/mgr/command-form";
import { ReattributeLossView, type LossReviewPhase } from "@/components/mgr/views/reattribute-loss";
import { useBrewery, useCommandContext } from "@/lib/brewery-provider";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import type { LossReview } from "@/lib/commands/compliance";
import { lossReviewReason, remainingAmountText, type LossTarget } from "@/lib/mgr/monthly-compliance-view";

type Payload = { adjustmentId: string; bbl: string; classification: LossTarget; destinationState?: string };

export function LossReviewForm({ loss }: { loss: LossReview }) {
  const breweryId = useBrewery();
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // No default: the brewer chooses which TTB line the loss moves to (#1510).
  const [target, setTarget] = useState<LossTarget | "">("");
  const [state, setState] = useState("");
  const [phase, setPhase] = useState<LossReviewPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const payload = useRef<Payload | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const retrying = phase === "unknown";
    if (!retrying) {
      const reason = lossReviewReason(amount, loss.remaining_bbl, target, state);
      if (reason || !target) return; // reason names a missing target; `!target` narrows the type for the payload
      requestId.current = crypto.randomUUID();
      payload.current = { adjustmentId: loss.adjustment_id, bbl: amount, classification: target, ...(target === "sample" ? { destinationState: state } : {}) };
    }
    if (!requestId.current || !payload.current) return;
    setError(null); setPhase("submitting");
    try {
      await command(breweryId, "reattribute_loss", payload.current, requestId.current, expectedContext.current);
      requestId.current = null; payload.current = null; setPhase("saved"); router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save this allocation";
      setError(message);
      if (cause instanceof CommandResponseError && canRetireCommandFailure(cause.status, retrying, cause.code)) {
        requestId.current = null; payload.current = null; setPhase("idle");
      } else setPhase("unknown");
    }
  }

  function changeOpen(next: boolean) {
    if (!next && (phase === "submitting" || phase === "unknown")) return;
    setOpen(next);
    // Open with the whole remainder, read now so a refreshed remainder is never stale.
    if (next) { setAmount(remainingAmountText(loss.remaining_bbl)); return; }
    setTarget(""); setState(""); setPhase("idle"); setError(null);
    requestId.current = null; payload.current = null;
  }

  return <CommandForm title="Reattribute loss" trigger={<Button size="sm" variant="outline" disabled={Number(loss.remaining_bbl) === 0}>Reattribute loss</Button>} open={open} onOpenChange={changeOpen}>
    <ReattributeLossView loss={loss} amount={amount} target={target} state={state} phase={phase} error={error}
      onAmount={setAmount} onTarget={setTarget} onState={setState} onSubmit={submit} />
  </CommandForm>;
}
