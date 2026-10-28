"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { useBrewery, useCommandContext } from "@/lib/brewery-provider";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import type { LossReview } from "@/lib/commands/compliance";
import { bblExact } from "@/lib/volume";
import { lossReviewReason, remainingAmountText, type LossTarget } from "@/lib/mgr/monthly-compliance-view";

type Payload = { adjustmentId: string; bbl: string; classification: LossTarget; destinationState?: string };
type Phase = "idle" | "submitting" | "unknown" | "saved";

export function LossReviewForm({ loss }: { loss: LossReview }) {
  const breweryId = useBrewery();
  const expectedContext = useRef(useCommandContext());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // No default: the brewer chooses which TTB line the loss moves to (#1510).
  const [target, setTarget] = useState<LossTarget | "">("");
  const [state, setState] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const payload = useRef<Payload | null>(null);
  const locked = phase === "submitting" || phase === "unknown" || phase === "saved";
  const reason = lossReviewReason(amount, loss.remaining_bbl, target, state);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const retrying = phase === "unknown";
    if (!retrying) {
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm">Batch {loss.batch_no} · original {bblExact(Number(loss.original_bbl), 8)} · remaining {bblExact(Number(loss.remaining_bbl), 8)}</p>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`loss-bbl-${loss.adjustment_id}`}>BBL to reattribute</Label>
        <Input id={`loss-bbl-${loss.adjustment_id}`} type="text" inputMode="decimal" aria-describedby={`loss-bbl-help-${loss.adjustment_id}`} value={amount} disabled={locked} onChange={(event) => setAmount(event.target.value)} required />
        <p id={`loss-bbl-help-${loss.adjustment_id}`} className="text-xs text-muted-foreground">Enter a positive decimal with up to 8 digits after the decimal point.</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`loss-target-${loss.adjustment_id}`}>Target</Label>
        <Select value={target} onValueChange={(value) => { setTarget(value as LossTarget); if (value !== "sample") setState(""); }} disabled={locked}>
          <SelectTrigger id={`loss-target-${loss.adjustment_id}`}><SelectValue placeholder="Choose a target" /></SelectTrigger>
          <SelectContent><SelectItem value="sample">Sample</SelectItem><SelectItem value="taproom">Taproom</SelectItem><SelectItem value="destruction">Destruction</SelectItem></SelectContent>
        </Select>
      </div>
      {target === "sample" && <div className="flex flex-col gap-1">
        <Label htmlFor={`loss-state-${loss.adjustment_id}`}>Destination state</Label>
        <Input id={`loss-state-${loss.adjustment_id}`} value={state} maxLength={2} pattern="[A-Z]{2}" placeholder="PA" disabled={locked} onChange={(event) => setState(event.target.value.toUpperCase())} required />
      </div>}
      {phase === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The amount, target, state, and request ID are frozen. Retry unchanged to recover the saved result.</CommandFormMessage>}
      <div role="status">{E.polite(phase === "saved" ? "Loss reattribution saved." : null)}</div>
      <CommandFormMessage error={error} />
      <CommandFormFooter>{E.submit(phase === "unknown" ? "Retry unchanged reattribution" : phase === "saved" ? "Saved" : "Save reattribution", {
        reason: phase === "idle" ? reason : null, submitting: phase === "submitting", disabled: phase === "saved",
      })}</CommandFormFooter>
    </form>
  </CommandForm>;
}
