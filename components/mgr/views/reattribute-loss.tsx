import type { FormEvent } from "react";
import { CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import type { LossReview } from "@/lib/commands/compliance";
import { lossReviewReason, remainingAmountText, type LossTarget } from "@/lib/mgr/monthly-compliance-view";
import { bblExact } from "@/lib/volume";

export type LossReviewPhase = "idle" | "submitting" | "unknown" | "saved";

/** The inventory and live command share exact amounts, an unchosen target, and recovery feedback. */
export function ReattributeLossView({ loss, amount = remainingAmountText(loss.remaining_bbl), target = "", state = "", phase = "idle", error, onAmount, onTarget, onState, onSubmit }: {
  loss: LossReview;
  amount?: string;
  target?: LossTarget | "";
  state?: string;
  phase?: LossReviewPhase;
  error?: string | null;
  onAmount?: (amount: string) => void;
  onTarget?: (target: LossTarget | "") => void;
  onState?: (state: string) => void;
  onSubmit?: (event: FormEvent) => void;
}) {
  const locked = phase !== "idle";
  const id = `loss-${loss.adjustment_id}`;
  return <form onSubmit={onSubmit ?? (event => event.preventDefault())} className="flex flex-col gap-4">
    <p className="text-sm">Batch {loss.batch_no} · original {bblExact(Number(loss.original_bbl), 8)} · remaining {bblExact(Number(loss.remaining_bbl), 8)}</p>
    <div className="flex flex-col gap-1">
      {E.edit("BBL to reattribute", amount, "text", undefined, { id: `${id}-bbl`, inputMode: "decimal", "aria-describedby": `${id}-bbl-help`, disabled: locked, onChange: onAmount, required: true })}
      <p id={`${id}-bbl-help`} className="text-xs text-muted-foreground">Enter a positive decimal with up to 8 digits after the decimal point.</p>
    </div>
    {E.pick("Target", target, [{ value: "", label: "Choose a target", disabled: true }, { value: "sample", label: "Sample" }, { value: "taproom", label: "Taproom" }, { value: "destruction", label: "Destruction" }], {
      id: `${id}-target`, disabled: locked, required: true, onChange: onTarget && (value => { onTarget(value as LossTarget | ""); if (value !== "sample") onState?.(""); }),
    })}
    {target === "sample" && E.edit("Destination state", state, "text", undefined, {
      id: `${id}-state`, maxLength: 2, pattern: "[A-Z]{2}", placeholder: "PA", disabled: locked, required: true, onChange: onState && (value => onState(value.toUpperCase())),
    })}
    {phase === "unknown" && <CommandFormMessage tone="warning">No trustworthy response arrived. The amount, target, state, and request ID are frozen. Retry unchanged to recover the saved result.</CommandFormMessage>}
    <div role="status">{E.polite(phase === "saved" ? "Loss reattribution saved." : null)}</div>
    <CommandFormMessage error={error} />
    <CommandFormFooter>{E.submit(phase === "unknown" ? "Retry unchanged reattribution" : phase === "saved" ? "Saved" : "Save reattribution", {
      reason: phase === "idle" ? lossReviewReason(amount, loss.remaining_bbl, target, state) : null, submitting: phase === "submitting", disabled: phase === "saved",
    })}</CommandFormFooter>
  </form>;
}
