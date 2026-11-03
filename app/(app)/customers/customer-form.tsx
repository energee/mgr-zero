// app/(app)/customers/customer-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_customer
// command. Doubles as create (no `customer` prop) and edit (`customer` prop
// pre-fills fields and the command input carries `id`, per plan decision 8).
// Sale channel is required — it decides the customer's prices.
"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { CustomerAccountFields, CustomerLicenseField, CustomerPaymentTermsField, CustomerSaleChannelField, CustomerTaxTreatmentField } from "@/components/mgr/views/customer";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { CustomerType, PaymentTerm } from "@/lib/mgr/enums";
import { customerNameError, customerStateReason, type CustomerEditValues } from "@/lib/mgr/customer-view";
import { paymentTermLabel } from "@/lib/mgr/labels";
import type { TaxTreatment } from "@/lib/mgr/tax-treatments";
import { submitReason } from "@/lib/mgr/submit-reason";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

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
  const touched = useTouchedLines(false);
  const nameError = customerNameError(name);
  const form = useCommandForm("upsert_customer", {
    validationFields: ["name", "alias", "country", "state", "saleChannelId", "licenseNumber"],
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

  const stateReason = customerStateReason({ country, state });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={isEdit ? "Edit customer" : "New customer"} trigger={<Button variant={isEdit ? "outline" : "default"} size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "New customer"}
        </Button>}>
        <form noValidate onSubmit={event => {
          touched.touch(0);
          if (nameError || stateReason) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          void form.submit(event);
        }} className="flex flex-col gap-4">
          <CustomerAccountFields values={{ name, alias, type, country, state }} nameLabel="Name" controls={{
            name: { id: "customer-name", onChange: setName, onBlur: () => touched.touch(0), error: (touched.shown(0) ? nameError : undefined) ?? form.fieldErrors.name },
            alias: { id: "customer-alias", onChange: setAlias, error: form.fieldErrors.alias },
            type: { id: "customer-type", onChange: value => setType(value as CustomerType) },
            country: { id: "customer-country", onChange: setCountry, error: form.fieldErrors.country },
            state: { id: "customer-state", onChange: setState, error: form.fieldErrors.state },
          }} />
          <CustomerSaleChannelField value={saleChannelId} channels={channels} controls={{ id: "customer-sale-channel", onChange: setSaleChannelId, error: form.fieldErrors.saleChannelId }} />
          <CustomerLicenseField value={licenseNumber} controls={{ id: "customer-license", onChange: setLicenseNumber, error: form.fieldErrors.licenseNumber }} />
          <CustomerPaymentTermsField value={paymentTerms} controls={{ id: "customer-terms", onChange: setPaymentTerms, displayValue: paymentTermLabel(paymentTerms) }} />
          <CustomerTaxTreatmentField value={taxTreatment} controls={{ id: "customer-tax", onChange: value => setTaxTreatment(value as TaxTreatment | "") }} />
          {/* upsert_customer takes no ship-to; ship-tos are upsert_ship_to on Customer detail. Create only: edit already has that page. */}
          {!isEdit && E.info("Add ship-to addresses on the customer’s page after you create the customer.")}
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            {E.submit(isEdit ? "Save" : "Create", {
              submitting: form.submitting,
              busy: isEdit ? "Saving…" : "Creating…",
              reason: submitReason([...(nameError ? ["a name"] : []), ...(stateReason ? ["a state"] : [])]),
            })}
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
