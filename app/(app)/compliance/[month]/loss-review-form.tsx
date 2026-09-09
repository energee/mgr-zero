"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useBrewery } from "@/app/(app)/brewery-provider";
import { command, CommandResponseError } from "@/lib/commands/client";
import { canRetireCommandFailure } from "@/lib/commands/failure";
import type { LossReview } from "@/lib/commands/compliance";

type Target = "sample" | "taproom" | "destruction";
type Payload = { adjustmentId: string; bbl: string; classification: Target; destinationState?: string };
type Phase = "idle" | "submitting" | "unknown" | "saved";

function bblUnits(value: string) {
  if (!/^(?:\d+(?:\.\d{0,8})?|\.\d{1,8})$/.test(value) || !/[1-9]/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole || "0") * BigInt(100_000_000) + BigInt(fraction.padEnd(8, "0") || "0");
}

export function LossReviewForm({ loss }: { loss: LossReview }) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState<Target>("sample");
  const [state, setState] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const payload = useRef<Payload | null>(null);
  const locked = phase === "submitting" || phase === "unknown" || phase === "saved";
  const amountUnits = bblUnits(amount);
  const remainingUnits = bblUnits(loss.remaining_bbl);
  const valid = amountUnits !== null && remainingUnits !== null && amountUnits <= remainingUnits && (target !== "sample" || /^[A-Z]{2}$/.test(state));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const retrying = phase === "unknown";
    if (!retrying) {
      if (!valid) return;
      requestId.current = crypto.randomUUID();
      payload.current = { adjustmentId: loss.adjustment_id, bbl: amount, classification: target, ...(target === "sample" ? { destinationState: state } : {}) };
    }
    if (!requestId.current || !payload.current) return;
    setError(null); setPhase("submitting");
    try {
      await command(breweryId, "reattribute_loss", payload.current, requestId.current);
      requestId.current = null; payload.current = null; setPhase("saved"); router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save this allocation";
      setError(message);
      if (cause instanceof CommandResponseError && canRetireCommandFailure(cause.status, retrying)) {
        requestId.current = null; payload.current = null; setPhase("idle");
      } else setPhase("unknown");
    }
  }

  function changeOpen(next: boolean) {
    if (!next && (phase === "submitting" || phase === "unknown")) return;
    setOpen(next);
    if (next) return;
    setAmount(""); setTarget("sample"); setState(""); setPhase("idle"); setError(null);
    requestId.current = null; payload.current = null;
  }

  return <CommandForm title="Reattribute completion loss" trigger={<Button size="sm" variant="outline" disabled={Number(loss.remaining_bbl) === 0}>Reattribute loss</Button>} open={open} onOpenChange={changeOpen}>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm">Batch {loss.batch_no} · original {loss.original_bbl} bbl · remaining {loss.remaining_bbl} bbl</p>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`loss-bbl-${loss.adjustment_id}`}>BBL to reattribute</Label>
        <Input id={`loss-bbl-${loss.adjustment_id}`} type="text" inputMode="decimal" aria-describedby={`loss-bbl-help-${loss.adjustment_id}`} value={amount} disabled={locked} onChange={(event) => setAmount(event.target.value)} required />
        <p id={`loss-bbl-help-${loss.adjustment_id}`} className="text-xs text-muted-foreground">Enter a positive decimal with up to 8 digits after the decimal point.</p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`loss-target-${loss.adjustment_id}`}>Target</Label>
        <Select value={target} onValueChange={(value) => { setTarget(value as Target); if (value !== "sample") setState(""); }} disabled={locked}>
          <SelectTrigger id={`loss-target-${loss.adjustment_id}`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="sample">Sample</SelectItem><SelectItem value="taproom">Taproom</SelectItem><SelectItem value="destruction">Destruction</SelectItem></SelectContent>
        </Select>
      </div>
      {target === "sample" && <div className="flex flex-col gap-1">
        <Label htmlFor={`loss-state-${loss.adjustment_id}`}>Destination state</Label>
        <Input id={`loss-state-${loss.adjustment_id}`} value={state} maxLength={2} pattern="[A-Z]{2}" placeholder="PA" disabled={locked} onChange={(event) => setState(event.target.value.toUpperCase())} required />
      </div>}
      {target === "taproom" && <CommandFormMessage tone="warning">Direct cellar Taproom removals cannot be filed until an external filing-line mapping is approved.</CommandFormMessage>}
      {phase === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The amount, target, state, and request ID are frozen. Retry unchanged to recover the saved result.</CommandFormMessage>}
      {phase === "saved" && <CommandFormMessage tone="warning">Loss reattribution saved.</CommandFormMessage>}
      <CommandFormMessage error={error} />
      <CommandFormFooter><Button type="submit" disabled={phase === "submitting" || phase === "saved" || (!valid && phase !== "unknown")}>{phase === "unknown" ? "Retry unchanged reattribution" : phase === "submitting" ? "Saving…" : phase === "saved" ? "Saved" : "Save reattribution"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
