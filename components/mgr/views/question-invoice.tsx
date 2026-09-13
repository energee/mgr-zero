// Shared invoice-question fields and sent state; QuestionForm owns the command.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionInvoiceViewModel } from "@/lib/mgr/question-invoice-view";

export type { QuestionInvoiceViewModel };

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
        <Textarea aria-label="What’s wrong with this invoice?" maxLength={2000} required value={onBody ? body : undefined} defaultValue={onBody ? undefined : body} onChange={event => onBody?.(event.target.value)} />
      </Field>}
      {messages}
      {footer !== undefined ? footer : sent
        ? <Button type="button" onClick={onClose}>Close</Button>
        : <Button type="submit" disabled={sending || (!!onBody && !body.trim())}>{sending ? "Sending…" : `Send to ${model.breweryName}`}</Button>}
    </>
  );
}
