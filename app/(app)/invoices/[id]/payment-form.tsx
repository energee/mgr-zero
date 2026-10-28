// app/(app)/invoices/[id]/payment-form.tsx — the invoice page's payment
// verbs (#1045): Record payment (record_invoice_payment) draws the shared
// RecordPaymentView, with the received day defaulting to and capped at the
// brewery's today; Void payment (void_invoice_payment) draws VoidPaymentView,
// a reason dialog like Write off. The RPCs re-check every rule.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { RecordPaymentView, VoidPaymentView } from "@/components/mgr/views/invoice";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { dollarsInput, toCents } from "@/lib/mgr/money";
import { invoicePaymentReady, type InvoicePaymentValue } from "@/lib/mgr/invoice-view";

/** `today` is breweryDate(timeZone), from the server page; `balanceCents` starts and caps the amount (#1506). */
export function RecordPaymentForm({ invoiceId, balanceCents, today, quickbooksConnected }: {
  invoiceId: string; balanceCents: number; today: string; quickbooksConnected: boolean;
}) {
  const initial = (): InvoicePaymentValue => ({ amount: dollarsInput(balanceCents), receivedOn: today, method: "", reference: "" });
  const [value, setValue] = useState(initial);
  const form = useCommandForm("record_invoice_payment", {
    build: () => ({
      invoiceId, amountCents: toCents(value.amount), receivedOn: value.receivedOn, method: value.method,
      reference: value.reference.trim() || undefined,
    }),
    reset: () => setValue(initial()),
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record payment"
      trigger={<Button variant="outline" size="sm" type="button">Record payment</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <RecordPaymentView value={value} maxCents={balanceCents} maxDate={today} quickbooksConnected={quickbooksConnected} onChange={setValue}
          footer={<><CommandFormMessage error={form.error} /><CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !invoicePaymentReady(value, balanceCents, today)}>{form.submitting ? "Recording…" : "Record payment"}</Button>
          </CommandFormFooter></>} />
      </form>
    </CommandForm>
  );
}

/** Voiding is the only correction: the payment row stays, marked with the reason. */
export function VoidPaymentForm({ paymentId, amount }: { paymentId: string; amount: string }) {
  const [reason, setReason] = useState("");
  const form = useCommandForm("void_invoice_payment", { build: () => ({ paymentId, reason }), reset: () => setReason("") });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Void payment"
      trigger={<Button variant="outline" size="sm" type="button">Void</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <VoidPaymentView paymentId={paymentId} amount={amount} reason={reason} onReasonChange={setReason}
          footer={<><CommandFormMessage error={form.error} /><CommandFormFooter>
            <Button type="submit" variant="destructive" disabled={form.submitting || !reason.trim()}>{form.submitting ? "Voiding…" : "Confirm void"}</Button>
          </CommandFormFooter></>} />
      </form>
    </CommandForm>
  );
}
