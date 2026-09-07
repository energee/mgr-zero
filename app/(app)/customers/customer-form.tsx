// app/(app)/customers/customer-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_customer
// command. Doubles as create (no `customer` prop) and edit (`customer` prop
// pre-fills fields and the command input carries `id`, per plan decision 8).
// Sale channel is required — it decides the customer's prices.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const CUSTOMER_TYPES = ["distributor", "retailer", "brewery", "other"] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

/** Wholesale is the channel a wholesale account almost always sits on, so it is
 * the create-form default; the brewery's first channel stands in if it is gone. */
const defaultChannel = (channels: { id: string; name: string }[]) =>
  channels.find((c) => c.name === "Wholesale")?.id ?? channels[0]?.id ?? "";

export type CustomerEditData = {
  id: string;
  name: string;
  type: CustomerType;
  state: string;
  saleChannelId: string;
  licenseNumber: string | null;
  paymentTerms: string;
};

export function CustomerForm({
  channels,
  customer,
}: {
  channels: { id: string; name: string }[];
  customer?: CustomerEditData;
}) {
  const initialChannel = customer?.saleChannelId ?? defaultChannel(channels);
  const isEdit = !!customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [type, setType] = useState<CustomerType>(customer?.type ?? "retailer");
  const [state, setState] = useState(customer?.state ?? "");
  const [saleChannelId, setSaleChannelId] = useState(initialChannel);
  const [licenseNumber, setLicenseNumber] = useState(customer?.licenseNumber ?? "");
  const [paymentTerms, setPaymentTerms] = useState(customer?.paymentTerms ?? "");
  const form = useCommandForm("upsert_customer", {
    build: () => ({
      ...(isEdit ? { id: customer.id } : {}),
      name,
      type,
      state: state.toUpperCase(),
      saleChannelId,
      licenseNumber: licenseNumber || undefined,
      paymentTerms: paymentTerms || undefined,
    }),
    reset: () => {
      setName(customer?.name ?? "");
      setType(customer?.type ?? "retailer");
      setState(customer?.state ?? "");
      setSaleChannelId(initialChannel);
      setLicenseNumber(customer?.licenseNumber ?? "");
      setPaymentTerms(customer?.paymentTerms ?? "");
    },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={isEdit ? "Edit Customer" : "New Customer"} trigger={<Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "New Customer"}
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-name">Name</Label>
            <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as CustomerType)}>
              <SelectTrigger id="customer-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CUSTOMER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-state">State</Label>
            <Input
              id="customer-state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="NY"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-sale-channel">Sale channel</Label>
            <Select value={saleChannelId} onValueChange={setSaleChannelId} required>
              <SelectTrigger id="customer-sale-channel"><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-license">License number</Label>
            <Input id="customer-license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-terms">Payment terms</Label>
            <Input id="customer-terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="net30" />
          </div>
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
