// components/mgr/submit-button.tsx — a form's submit button that says why it is
// withheld (#1122). It is disabled while the command runs or while `reason`
// names what the form still needs; the reason is printed beside the button and
// tied to it with aria-describedby, because a disabled button cannot be focused
// and a hover tooltip never reaches touch or keyboard users. Screen authors call
// E.submit; IrreversibleSubmit draws it with the irreversible fill. Pick
// sheet's Print and ConfirmDeleteControl's sheet trigger use it as a plain
// button (`type="button"`); the trigger's Radix props and ref reach Button
// through `...button`, so keep that spread. Its own
// "use client" module because it needs useId and e.tsx is imported by
// server-rendered pages.
"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type SubmitButtonProps = Omit<ComponentProps<typeof Button>, "type" | "children"> & {
  label: ReactNode;
  /** "button" for an action that is not a form submit (Print); defaults to "submit". */
  type?: "submit" | "button";
  /** What the form still needs, from submitReason (lib/mgr/submit-reason.ts); null or absent when ready. */
  reason?: string | null;
  submitting?: boolean;
  /** The label while submitting. */
  busy?: string;
};

/** Reason first, so it sits above the button on the phone and to its left in a desk footer row. */
export function SubmitButton({ label, reason, submitting = false, busy = "Saving…", id, disabled = false, type = "submit", ...button }: SubmitButtonProps) {
  const generated = useId();
  const reasonId = `${id ?? generated}-reason`;
  return <>
    {reason ? <p id={reasonId} className="text-sm text-muted-foreground md:self-center">{reason}</p> : null}
    <Button {...button} id={id} type={type} disabled={submitting || disabled || Boolean(reason)} aria-describedby={reason ? reasonId : undefined}>{submitting ? busy : label}</Button>
  </>;
}
