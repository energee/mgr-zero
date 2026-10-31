"use client";

import { useState } from "react";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { transferReceiveSources, transferSourceQty, type TransferReceiveLine, type TransferSourceLine } from "@/lib/mgr/transfer-detail-view";

export type TransferActionBindings = {
  busy?: boolean;
  error?: string | null;
  onReceive?: (lines: TransferReceiveLine[]) => void;
  onCancel?: (reason: string) => Promise<boolean>;
};

/** The lot quantities, next verb, and cancellation surface have one drawing. */
export function TransferActionsView({ lines, busy = false, error, onReceive, onCancel }: TransferActionBindings & { lines: TransferSourceLine[] }) {
  const [quantities, setQuantities] = useState<Record<string, Record<string, string>>>({});
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  function changeCancelOpen(next: boolean) {
    setCancelOpen(next);
    if (!next) setReason("");
  }

  return (
    <div data-preview-action className="flex flex-col gap-2">
      {lines.map(line => (
        <div key={line.id} className="flex flex-col gap-2 border-b pb-3">
          <p>Choose sources totaling {line.qty} units</p>
          {line.sources.map(source => {
            const sourceKey = source.lotId ?? "";
            return <div key={sourceKey}>
              {E.edit(`${source.name} · ${source.lotCode ?? "Untracked / legacy stock"} · ${source.qty} available`, transferSourceQty(quantities[line.id]?.[sourceKey], line.sources.length, line.qty), "number", undefined, {
                min: 0,
                step: line.step,
                disabled: busy,
                onChange: qty => setQuantities(previous => ({ ...previous, [line.id]: { ...previous[line.id], [sourceKey]: qty } })),
              })}
            </div>;
          })}
        </div>
      ))}
      {E.btn("Receive", busy ? "irr disabled" : "irr", undefined, () => onReceive?.(transferReceiveSources(lines, quantities)), { "data-preview-action": true })}
      <CommandForm open={cancelOpen} onOpenChange={changeCancelOpen} title="Cancel transfer" trigger={E.btn("Cancel transfer", busy ? "g disabled" : "g")} previewAction>
        <form data-preview-action className="flex flex-col gap-4" onSubmit={async event => {
          event.preventDefault();
          event.stopPropagation();
          if (busy) return;
          if (!onCancel || await onCancel(reason)) changeCancelOpen(false);
        }}>
          {E.edit("Reason", reason, "text", undefined, { required: true, maxLength: 500, disabled: busy, onChange: setReason })}
          <p className="text-sm text-muted-foreground">Nothing has left the source bin, so no stock moves.</p>
          <CommandFormMessage error={error} />
          <CommandFormFooter>{E.submit("Cancel transfer", { variant: "destructive", submitting: busy, busy: "Cancelling…" })}</CommandFormFooter>
        </form>
      </CommandForm>
      {!cancelOpen && <CommandFormMessage error={error} />}
    </div>
  );
}
