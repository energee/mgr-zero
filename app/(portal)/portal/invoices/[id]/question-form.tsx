"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { QuestionInvoiceView } from "@/components/mgr/views/question-invoice";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function QuestionForm({ invoiceId, label, breweryName }: { invoiceId: string; label: string; breweryName: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const action = useCommandAction();
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) { setBody(""); setSent(false); action.setError(null); }
  }
  return <CommandForm open={open} onOpenChange={changeOpen} title="Question invoice"
    trigger={<Button variant="outline" size="sm">Ask about this invoice</Button>}>
    <form className="flex flex-col gap-2" onSubmit={event => {
      event.preventDefault();
      if (!sent && !action.busy && body.trim()) void action.run("raise_invoice_question", { invoiceId, body }, () => setSent(true));
    }}>
      <QuestionInvoiceView model={{ label, breweryName }} body={body} onBody={setBody} sent={sent} sending={action.busy}
        onClose={() => changeOpen(false)} messages={<CommandFormMessage error={action.error} />} />
    </form>
  </CommandForm>;
}
