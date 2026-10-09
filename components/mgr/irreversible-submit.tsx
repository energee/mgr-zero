// components/mgr/irreversible-submit.tsx — the submit button of a sheet whose
// verb cannot be undone (transfer, addition, count): one place for the
// irreversible treatment, so every footer is a one-line wrapper naming its verb.
import { Button } from "@/components/ui/button";

/** The irreversible fill, for a trigger that is not a submit (ConfirmDeleteControl's). */
export const IRREVERSIBLE = "bg-irreversible text-irreversible-foreground hover:bg-irreversible/90";

export function IrreversibleSubmit({ label, busy = "Saving…", formId, submitting = false, disabled = false }: { label: string; busy?: string; formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <Button form={formId} type="submit" data-variant="irreversible" className={IRREVERSIBLE} disabled={submitting || disabled}>{submitting ? busy : label}</Button>;
}
