// app/(app)/customers/customer-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_customer
// command. Doubles as create (no `customer` prop) and edit (`customer` prop
// pre-fills fields and the command input carries `id`, per plan decision 8).
// Sale channel is required — it decides the customer's prices.
"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { FieldDescription } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { PAYMENT_TERMS, type CustomerType, type PaymentTerm } from "@/lib/mgr/enums";
import { CUSTOMER_ALIAS_HELP, type CustomerEditValues } from "@/lib/mgr/customer-view";
import { COUNTRY_OPTIONS, CUSTOMER_TYPE_OPTIONS, PAYMENT_TERM_LABEL, paymentTermLabel, sentenceCase } from "@/lib/mgr/labels";
import { TAX_TREATMENTS, type TaxTreatment } from "@/lib/mgr/tax-treatments";
import { submitReason } from "@/lib/mgr/submit-reason";

export type { TaxTreatment };

/** upsert_customer input from form values, shared by this dialog and the
 *  inline Customer detail form: blanks become undefined, state is uppercased
 *  and sent for a US customer only (another country has none). */
export const upsertCustomerInput = (values: CustomerEditValues, id?: string) => ({
  ...(id ? { id } : {}),
  name: values.name,
  alias: values.alias.trim() ? values.alias : undefined,
  type: values.type as CustomerType,
  country: values.country,
  state: values.country === "US" ? values.state.toUpperCase() : undefined,
  saleChannelId: values.saleChannelId,
  licenseNumber: values.licenseNumber || undefined,
  paymentTerms: values.paymentTerms as PaymentTerm,
  taxTreatment: (values.taxTreatment || undefined) as TaxTreatment | undefined,
});

/** Wholesale is the channel a wholesale account almost always sits on, so it is
 * the create-form default; the brewery's first channel stands in if it is gone. */
const defaultChannel = (channels: { id: string; name: string }[]) =>
  channels.find((c) => c.name === "Wholesale")?.id ?? channels[0]?.id ?? "";

export type CustomerEditData = {
  id: string;
  name: string;
  alias: string | null;
  type: CustomerType;
  country: string;
  state: string | null;
  saleChannelId: string;
  licenseNumber: string | null;
  paymentTerms: string;
  taxTreatment: TaxTreatment | null;
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
  const [alias, setAlias] = useState(customer?.alias ?? "");
  const [type, setType] = useState<CustomerType>(customer?.type ?? "retailer");
  const [country, setCountry] = useState(customer?.country ?? "US");
  const [state, setState] = useState(customer?.state ?? "");
  const [saleChannelId, setSaleChannelId] = useState(initialChannel);
  const [licenseNumber, setLicenseNumber] = useState(customer?.licenseNumber ?? "");
  const [paymentTerms, setPaymentTerms] = useState(customer?.paymentTerms ?? "net30");
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment | "">(customer?.taxTreatment ?? "");
  const form = useCommandForm("upsert_customer", {
    build: () => upsertCustomerInput({ name, alias, type, country, state, saleChannelId, licenseNumber, paymentTerms, taxTreatment }, customer?.id),
    reset: () => {
      setName(customer?.name ?? "");
      setAlias(customer?.alias ?? "");
      setType(customer?.type ?? "retailer");
      setCountry(customer?.country ?? "US");
      setState(customer?.state ?? "");
      setSaleChannelId(initialChannel);
      setLicenseNumber(customer?.licenseNumber ?? "");
      setPaymentTerms(customer?.paymentTerms ?? "net30");
      setTaxTreatment(customer?.taxTreatment ?? "");
    },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={isEdit ? "Edit customer" : "New customer"} trigger={<Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "New customer"}
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-name">Name (required)</Label>
            <Input id="customer-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            {E.edit("Alias", alias, "text", undefined, { id: "customer-alias", onChange: setAlias, "aria-describedby": "customer-alias-help" })}
            <FieldDescription id="customer-alias-help">{CUSTOMER_ALIAS_HELP}</FieldDescription>
          </div>
          {E.pick("Type", type, CUSTOMER_TYPE_OPTIONS, { id: "customer-type", onChange: (value) => setType(value as CustomerType) })}
          {E.pick("Country", country, COUNTRY_OPTIONS, { id: "customer-country", onChange: setCountry, required: true })}
          {country === "US" && <div className="flex flex-col gap-2">
            <Label htmlFor="customer-state">State</Label>
            <Input
              id="customer-state"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder="NY"
              required
            />
          </div>}
          {E.pick("Sale channel", saleChannelId, channels.map((c) => ({ value: c.id, label: c.name })), { id: "customer-sale-channel", onChange: setSaleChannelId, required: true })}
          <div className="flex flex-col gap-2">
            <Label htmlFor="customer-license">License number</Label>
            <Input id="customer-license" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
          </div>
          {E.pick("Payment terms", paymentTerms, PAYMENT_TERMS.map(t => ({ value: t, label: PAYMENT_TERM_LABEL[t] })), { id: "customer-terms", onChange: setPaymentTerms, displayValue: paymentTermLabel(paymentTerms) })}
          {E.pick("Tax treatment", taxTreatment, [{ value: "", label: "Inherit sale channel" }, ...TAX_TREATMENTS.map(t => ({ value: t, label: sentenceCase(t) }))], { id: "customer-tax", onChange: value => setTaxTreatment(value as TaxTreatment | ""), displayValue: taxTreatment ? sentenceCase(taxTreatment) : "Inherit sale channel" })}
          {/* upsert_customer takes no ship-to; ship-tos are upsert_ship_to on Customer detail. Create only: edit already has that page. */}
          {!isEdit && E.info("Add ship-to addresses on the customer’s page after you create the customer.")}
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            {E.submit(isEdit ? "Save" : "Create", {
              submitting: form.submitting,
              busy: isEdit ? "Saving…" : "Creating…",
              reason: submitReason(name.trim() ? [] : ["a name"]),
            })}
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
