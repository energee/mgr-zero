// app/(app)/vendors/vendor-form.tsx — CommandForm for upsert_vendor: name,
// email, phone, payment terms, and the typed lead time Planning dates a buy-by
// from. One component creates (no vendor) or edits (a vendor passed in).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { VendorView } from "@/components/mgr/views/vendor";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toVendorViewProps } from "@/lib/mgr/vendor-view";

export type Vendor = { id: string; name: string; email: string | null; phone: string | null; payment_terms: string; lead_time_days: number | null; active: boolean };

const TERMS: [string, string][] = [["due_on_receipt", "Due on receipt"], ["net15", "Net 15"], ["net30", "Net 30"]];

export function VendorForm({ vendor }: { vendor?: Vendor }) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [terms, setTerms] = useState(vendor?.payment_terms ?? "net30");
  const [lead, setLead] = useState(vendor?.lead_time_days?.toString() ?? "");
  const form = useCommandForm("upsert_vendor", {
    build: () => ({
      id: vendor?.id, name, email: email || undefined, phone: phone || undefined, paymentTerms: terms,
      leadTimeDays: lead === "" ? undefined : Number(lead),
    }),
    reset: () => { setName(vendor?.name ?? ""); setEmail(vendor?.email ?? ""); setPhone(vendor?.phone ?? ""); setTerms(vendor?.payment_terms ?? "net30"); setLead(vendor?.lead_time_days?.toString() ?? ""); },
  });
  const trigger = vendor ? <Button variant="ghost" size="sm">Edit</Button> : <Button size="sm">Add vendor</Button>;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Vendor" trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <VendorView
          model={toVendorViewProps({ name, email, phone, terms: TERMS.find(([value]) => value === terms)?.[1] ?? "Net 30", termsOptions: TERMS.map(([, label]) => label), leadDays: lead })}
          controls={{ name: setName, email: setEmail, phone: setPhone, terms: (label) => setTerms(TERMS.find(([, value]) => value === label)?.[0] ?? "net30"), leadDays: setLead }}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !name.trim()}>{form.submitting ? "Saving…" : "Save vendor"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
