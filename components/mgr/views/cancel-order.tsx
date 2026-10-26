"use client";

import { useId, useState, type ReactNode } from "react";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { submitReason } from "@/lib/mgr/submit-reason";

/** Inventory and live orders share the reason field, submit guard, and dialog. */
export function CancelOrderControl({ trigger, busy = false, error, onOpenChange, onCancel }: {
  trigger: ReactNode;
  busy?: boolean;
  error?: string | null;
  onOpenChange?: () => void;
  onCancel?: (reason: string) => Promise<boolean>;
}) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const trimmedReason = reason.trim();
  const reasonError = trimmedReason ? undefined : "Reason required";
  function changeOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.();
    setTouched(false);
    if (!next) setReason("");
  }
  return <CommandForm open={open} onOpenChange={changeOpen} title="Cancel order" trigger={trigger} previewAction>
    <form data-preview-action noValidate className="flex flex-col gap-4" onSubmit={async event => {
      event.preventDefault();
      event.stopPropagation();
      setTouched(true);
      if (busy || reasonError) return;
      if (!onCancel || await onCancel(trimmedReason)) changeOpen(false);
    }}>
      {E.edit("Reason", reason, "text", undefined, { id: reasonId, onChange: setReason, onBlur: () => setTouched(true), required: true, disabled: busy, error: touched ? reasonError : undefined })}
      <CommandFormMessage error={error} />
      <CommandFormFooter>
        {E.submit("Cancel order", { variant: "destructive", submitting: busy, busy: "Cancelling…", reason: submitReason(reasonError ? ["a reason"] : []) })}
      </CommandFormFooter>
    </form>
  </CommandForm>;
}
