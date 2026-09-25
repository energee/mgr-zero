// Shared invoice-question fields and sent state; QuestionForm owns the command.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionInvoiceViewModel } from "@/lib/mgr/question-invoice-view";

export type { QuestionInvoiceViewModel };

/** raise_invoice_question caps body at 2,000; the textarea cuts a longer paste, so the counter says so. */
const MAX_BODY = 2000;

export function QuestionInvoiceView({
  model,
  footer,
  body = "",
  onBody,
  messages,
  sending = false,
  sent = false,
  onClose,
}: {
  model: QuestionInvoiceViewModel;
  footer?: ReactNode;
  body?: string; onBody?: (value: string) => void;
  messages?: ReactNode; sending?: boolean; sent?: boolean; onClose?: () => void;
}) {
  return (
    <>
      {E.fld("Invoice", model.label)}
      {sent ? E.info("Sent to the brewery. Someone will get back to you; nothing on the invoice changes.") : <Field>
        <FieldLabel>What’s wrong with this invoice?</FieldLabel>
        <Textarea aria-label="What’s wrong with this invoice?" maxLength={MAX_BODY} required value={onBody ? body : undefined} defaultValue={onBody ? undefined : body} onChange={event => onBody?.(event.target.value)} />
        {onBody && <FieldDescription className="text-right">{body.length.toLocaleString("en-US")} of {MAX_BODY.toLocaleString("en-US")} characters{body.length >= MAX_BODY ? " · longer text is cut off" : ""}</FieldDescription>}
      </Field>}
      {messages}
      {footer !== undefined ? footer : sent
        ? <Button type="button" onClick={onClose}>Close</Button>
        : <Button type="submit" disabled={sending || (!!onBody && !body.trim())}>{sending ? "Sending…" : `Send to ${model.breweryName}`}</Button>}
    </>
  );
}
