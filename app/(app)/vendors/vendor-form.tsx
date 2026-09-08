// app/(app)/vendors/vendor-form.tsx — CommandForm for upsert_vendor: name,
// email, phone, payment terms, and the typed lead time Planning dates a buy-by
// from. One component creates (no vendor) or edits (a vendor passed in).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

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
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={vendor ? vendor.name : "New vendor"} trigger={trigger}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="v-name">Vendor name</Label>
          <Input id="v-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="v-email">Email · optional</Label>
          <Input id="v-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="v-phone">Phone · optional</Label>
          <Input id="v-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="v-terms">Terms</Label>
            <Select value={terms} onValueChange={setTerms}>
              <SelectTrigger id="v-terms"><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="v-lead">Lead time (days)</Label>
            <Input id="v-lead" type="number" min="0" step="1" value={lead} onChange={(e) => setLead(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">The typed figure is what Planning dates a buy-by from. Received orders give an observed average that is read, never stored.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim()}>{form.submitting ? "Saving…" : "Save vendor"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
