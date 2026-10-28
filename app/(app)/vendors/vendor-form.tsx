// app/(app)/vendors/vendor-form.tsx — CommandForm for upsert_vendor: name,
// email, phone, payment terms, and the typed lead time Planning dates a buy-by
// from. One component creates (no vendor) or edits (a vendor passed in).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { VendorView } from "@/components/mgr/views/vendor";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { PAYMENT_TERMS } from "@/lib/mgr/enums";
import { PAYMENT_TERM_LABEL, paymentTermLabel } from "@/lib/mgr/labels";
import { vendorReason } from "@/lib/mgr/vendor-view";
export type Vendor = { id: string; name: string; email: string | null; phone: string | null; payment_terms: string; lead_time_days: number | null; active: boolean };

export function VendorForm({ vendor }: { vendor?: Vendor }) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [terms, setTerms] = useState(vendor?.payment_terms ?? "net30");
  const [lead, setLead] = useState(vendor?.lead_time_days?.toString() ?? "");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const reason = vendorReason({ name, email, phone, leadDays: lead });
  const build = () => ({
    id: vendor?.id, name, email: email || undefined, phone: phone || undefined, paymentTerms: terms,
    leadTimeDays: lead === "" ? undefined : Number(lead),
  });
  const form = useCommandForm("upsert_vendor", {
    validationFields: ["name", "email", "phone", "leadTimeDays"],
    build,
    reset: () => { setName(vendor?.name ?? ""); setEmail(vendor?.email ?? ""); setPhone(vendor?.phone ?? ""); setTerms(vendor?.payment_terms ?? "net30"); setLead(vendor?.lead_time_days?.toString() ?? ""); setValidationAttempted(false); },
  });
  const trigger = vendor ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm">Add vendor</Button>;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={vendor ? "Edit vendor" : "New vendor"} trigger={trigger}>
      <form noValidate onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        setValidationAttempted(true);
        if (!form.busy && !reason && event.currentTarget.checkValidity()) void form.submit(event);
      }} className="flex flex-col gap-4">
        <VendorView
          model={{ name, email, phone, terms: paymentTermLabel(terms), termsOptions: PAYMENT_TERMS.map(term => PAYMENT_TERM_LABEL[term]), leadDays: lead, active: vendor?.active ?? null }}
          errors={{ ...form.fieldErrors, leadDays: form.fieldErrors.leadTimeDays }}
          controls={{ name: setName, email: setEmail, phone: setPhone, terms: (label) => setTerms(PAYMENT_TERMS.find(term => PAYMENT_TERM_LABEL[term] === label) ?? "net30"), leadDays: setLead }}
          validationAttempted={validationAttempted}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter>{E.submit("Save vendor", { submitting: form.submitting, reason })}</CommandFormFooter>}
          busy={form.busy}
          error={form.error}
          onSetActive={active => form.run("upsert_vendor", { ...build(), active }, () => form.setOpen(false))}
        />
      </form>
    </CommandForm>
  );
}
