// app/(app)/customers/customer-form.tsx — dialog form for the upsert_customer command.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const CUSTOMER_TYPES = ["distributor", "retailer", "brewery", "other"] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

const NONE_PRICE_LIST = "__none__";

export function CustomerForm({ priceLists }: { priceLists: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomerType>("retailer");
  const [state, setState] = useState("");
  const [priceListId, setPriceListId] = useState(NONE_PRICE_LIST);
  const [licenseNumber, setLicenseNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const form = useCommandForm("upsert_customer", {
    build: () => ({
      name,
      type,
      state: state.toUpperCase(),
      priceListId: priceListId === NONE_PRICE_LIST ? undefined : priceListId,
      licenseNumber: licenseNumber || undefined,
      paymentTerms: paymentTerms || undefined,
    }),
    reset: () => {
      setName(""); setType("retailer"); setState(""); setPriceListId(NONE_PRICE_LIST);
      setLicenseNumber(""); setPaymentTerms("");
    },
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button>New Customer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
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
                {CUSTOMER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
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
                <SelectItem value={NONE_PRICE_LIST}>None</SelectItem>
                {priceLists.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
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
          {form.error && <p className="text-sm text-red-600">{form.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
