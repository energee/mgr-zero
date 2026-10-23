// components/mgr/irreversible-submit.tsx — the submit button of a sheet whose
// verb cannot be undone (transfer, addition, count): one place for the
// irreversible treatment, so every footer is a one-line wrapper naming its verb.
// It is a SubmitButton, so a `reason` prints why it is withheld.
import { SubmitButton } from "@/components/mgr/submit-button";

/** The irreversible fill, for a trigger that is not a submit (ConfirmDeleteControl's). */
export const IRREVERSIBLE = "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90";

export function IrreversibleSubmit({ label, busy = "Saving…", formId, submitting = false, disabled = false, reason }: { label: string; busy?: string; formId?: string; submitting?: boolean; disabled?: boolean; reason?: string | null }) {
  return <SubmitButton form={formId} data-variant="irreversible" className={IRREVERSIBLE} label={label} busy={busy} submitting={submitting} disabled={disabled} reason={reason} />;
}
