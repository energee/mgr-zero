// app/(app)/invoices/[id]/mark-answered.tsx — the one verb on a buyer's
// question: resolve_invoice_question, which clears its sales Today row. The
// reply itself happens by phone or email, which is why it says answered.
"use client";

import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function MarkAnswered({ questionId }: { questionId: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run("resolve_invoice_question", { questionId })}>{busy ? "Marking…" : "Mark answered"}</Button>
      <CommandFormMessage error={error} />
    </span>
  );
}
