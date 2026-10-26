// components/mgr/irreversible-submit.tsx — the submit button of a sheet whose
// verb cannot be undone (transfer, addition, count, ship, close run): one place
// for the irreversible treatment, so every footer is a one-line wrapper naming
// its verb. It is a SubmitButton, so a `reason` prints why it is withheld, and
// `type="button"` with `onClick` serves a verb that is not a form submit.
import { SubmitButton, type SubmitButtonProps } from "@/components/mgr/submit-button";
import { cn } from "@/lib/utils";

/** The irreversible fill, for a trigger that is not a submit (ConfirmDeleteControl's). */
export const IRREVERSIBLE = "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90";

/** `formId` ties the button to a form outside it (a pinned footer); `className` adds layout to the fill. */
export function IrreversibleSubmit({ formId, className, ...button }: Omit<SubmitButtonProps, "form"> & { label: string; formId?: string }) {
  return <SubmitButton {...button} form={formId} data-variant="irreversible" className={cn(IRREVERSIBLE, className)} />;
}
