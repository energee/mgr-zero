// app/(app)/customers/customer-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_customer
// command. Doubles as create (no `customer` prop) and edit (`customer` prop
// pre-fills fields and the command input carries `id`, per plan decision 8).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const CUSTOMER_TYPES = ["distributor", "retailer", "brewery", "other"] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

const NONE_PRICE_LIST = "__none__";

export type CustomerEditData = {
  id: string;
  name: string;
  type: CustomerType;
  state: string;
  priceListId: string | null;
  licenseNumber: string | null;
  paymentTerms: string;
};

export function CustomerForm({
  priceLists,
  customer,
}: {
  priceLists: { id: string; name: string }[];
  customer?: CustomerEditData;
}) {
  const isEdit = !!customer;
  const [name, setName] = useState(customer?.name ?? "");
  const [type, setType] = useState<CustomerType>(customer?.type ?? "retailer");
  const [state, setState] = useState(customer?.state ?? "");
  const [priceListId, setPriceListId] = useState(customer?.priceListId ?? NONE_PRICE_LIST);
  const [licenseNumber, setLicenseNumber] = useState(customer?.licenseNumber ?? "");
  const [paymentTerms, setPaymentTerms] = useState(customer?.paymentTerms ?? "");
  const form = useCommandForm("upsert_customer", {
    build: () => ({
      ...(isEdit ? { id: customer.id } : {}),
      name,
      type,
      state: state.toUpperCase(),
      priceListId: priceListId === NONE_PRICE_LIST ? undefined : priceListId,
      licenseNumber: licenseNumber || undefined,
      paymentTerms: paymentTerms || undefined,
    }),
    reset: () => {
      setName(customer?.name ?? "");
      setType(customer?.type ?? "retailer");
      setState(customer?.state ?? "");
      setPriceListId(customer?.priceListId ?? NONE_PRICE_LIST);
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
            <Label htmlFor="customer-price-list">Price list</Label>
            <Select value={priceListId} onValueChange={setPriceListId}>
              <SelectTrigger id="customer-price-list">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NONE_PRICE_LIST}>None</SelectItem>
                  {priceLists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
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
          {form.error && <p className="text-sm text-destructive">{form.error}</p>}
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
