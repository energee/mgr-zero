// app/(portal)/portal/invoices/[id]/question-form.tsx — Question invoice
// (screen record): the buyer writes a note about this invoice and it lands
// on the brewery's sales Today list (raise_invoice_question). Nothing on the
// invoice changes; the sent state is the same sheet saying so.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function QuestionForm({ invoiceId, label, brewery }: { invoiceId: string; label: string; brewery: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const action = useCommandAction();
  return (
    <CommandForm open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setBody(""); setSent(false); } }} title="Question about this invoice"
      trigger={<Button variant="outline" size="sm">Ask about this invoice</Button>}>
      {E.fld("Invoice", label)}
      {sent ? (
        <>
          {E.info(`Sent to ${brewery}. Someone will get back to you; nothing on the invoice changes.`)}
          <CommandFormFooter><Button onClick={() => setOpen(false)}>Close</Button></CommandFormFooter>
        </>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void action.run("raise_invoice_question", { invoiceId, body }, () => setSent(true)); }}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="question-body">What’s wrong with this invoice?</Label>
            <Textarea id="question-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
          </div>
          <CommandFormMessage error={action.error} />
          <CommandFormFooter><Button type="submit" disabled={action.busy || !body.trim()}>{action.busy ? "Sending…" : `Send to ${brewery}`}</Button></CommandFormFooter>
        </form>
      )}
    </CommandForm>
  );
}
