// components/mgr/irreversible-submit.tsx — the submit button of a sheet whose
// verb cannot be undone (transfer, addition, count): one place for the
// irreversible treatment, so every footer is a one-line wrapper naming its verb.
import { Button } from "@/components/ui/button";

export function IrreversibleSubmit({ label, busy = "Saving…", formId, submitting = false, disabled = false }: { label: string; busy?: string; formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <Button form={formId} type="submit" data-variant="irreversible" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={submitting || disabled}>{submitting ? busy : label}</Button>;
}
