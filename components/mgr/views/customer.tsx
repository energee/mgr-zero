"use client";

// Customer detail shares inline account and trading-term edits. Live supplies
// persisted values, permission, command callbacks, and authorized activity slots.
import { useState, useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PAYMENT_TERMS } from "@/lib/mgr/enums";
import { PAYMENT_TERM_LABEL, paymentTermLabel, sentenceCase } from "@/lib/mgr/labels";
import { TAX_TREATMENTS } from "@/lib/mgr/tax-treatments";
import { E } from "@/components/mgr/e";
import type { CustomerViewModel } from "@/lib/mgr/customer-view";
import { DeleteCustomerControl } from "./delete-customer";
import { RevokePortalUserControl } from "./revoke-portal-user";

export type { CustomerViewModel };

export type CustomerDetailSlot = {
  shipTos?: { key: string; title: string; detail: string; action?: ReactNode }[];
  addShipTo?: ReactNode;
  kegHref?: string;
  ordersHref?: string;
  /** Live sales/admin: InviteForm. `null` hides the whole Portal users section. */
  portalUsers?: ReactNode;
  /** Live sales/admin: the Remove access verb for one portal user row. */
  revokePortalUser?: Record<string, ReactNode>;
};

export type CustomerEditValues = { name: string; type: string; state: string; saleChannelId: string; licenseNumber: string; paymentTerms: string; taxTreatment: string };

export function CustomerView({
  model,
  headerAction,
  footer,
  detail,
  deleteAction,
  initial, channels, canWrite = true, busy = false, error = null, onSave,
}: {
  model: CustomerViewModel;
  headerAction?: ReactNode;
  footer?: ReactNode;
  /** Live activity and access controls around the shared edit fields. */
  detail?: CustomerDetailSlot;
  deleteAction?: ReactNode;
  initial?: CustomerEditValues;
  channels?: { id: string; name: string }[];
  canWrite?: boolean;
  busy?: boolean;
  error?: string | null;
  onSave?: (values: CustomerEditValues) => void;
}) {
  const formId = useId();
  const [values, setValues] = useState<CustomerEditValues>(initial ?? { name: model.name, type: model.type.toLowerCase(), state: model.state, saleChannelId: model.channel, licenseNumber: model.license, paymentTerms: PAYMENT_TERMS.find(term => PAYMENT_TERM_LABEL[term] === model.terms) ?? "net30", taxTreatment: TAX_TREATMENTS.find(tax => sentenceCase(tax) === model.taxTreatment) ?? "" });
  const controls = (key: keyof CustomerEditValues) => ({ id: `${formId}-${key}`, form: formId, disabled: !canWrite || busy, onChange: (value: string) => setValues(current => ({ ...current, [key]: key === "state" ? value.toUpperCase() : value })) });
  const removal = deleteAction !== undefined ? deleteAction : <DeleteCustomerControl name={model.name} />;
  return (
    <div className="@container flex min-w-0 flex-col gap-6 [&_[data-slot=item]]:rounded-none [&_[data-slot=item]]:border-0 [&_[data-slot=item]]:border-b [&_[data-slot=item]]:px-0">
      <header className="[&_h1]:font-heading [&_h1]:text-2xl [&_h1]:tracking-tight @min-[48rem]:[&_h1]:text-3xl">
        {E.back("Customers", model.name, headerAction, model.backHref)}
      </header>
      <div className="grid items-start gap-6 @min-[48rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Account details" className="py-5">
            <h2 className="mb-3 font-heading text-xl font-semibold">Account details</h2>
            <div className="flex flex-col gap-4">
              {E.edit("Customer name", values.name, "text", undefined, { ...controls("name"), required: true })}
              {E.pick("Type", values.type, ["retailer", "distributor", "brewery", "other"].map(value => ({ value, label: sentenceCase(value) })), { ...controls("type"), displayValue: sentenceCase(values.type) })}
              {E.edit("State", values.state, "text", undefined, { ...controls("state"), required: true, maxLength: 2, minLength: 2 })}
              {E.edit("License number", values.licenseNumber, "text", undefined, controls("licenseNumber"))}
            </div>
          </section>
          <section aria-label="Ship-tos" className="py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-semibold">Ship-tos</h2>
              {detail?.addShipTo}
            </div>
            {detail ? <div className="flex flex-col gap-3">
              {detail.shipTos?.length ? detail.shipTos.map(s =>
                <div key={s.key}>{E.row(s.title, s.detail, s.action)}</div>
              ) : <div className="py-6">
                <p className="text-sm font-medium">No ship-to addresses yet</p>
                {detail.addShipTo && <p className="mt-1 text-sm text-muted-foreground">Add a delivery address before placing an order.</p>}
              </div>}
            </div> : E.nav("Ship-tos", model.shipTos)}
          </section>
          {detail?.portalUsers !== null && <section aria-label="Portal users" className="py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-heading text-xl font-semibold">Portal users</h2>
                <p className="mt-1 text-sm text-muted-foreground">Buyer access to orders and invoices.</p>
              </div>
              {detail
                ? ("portalUsers" in detail ? detail.portalUsers : E.gated("Portal users", "invitations aren’t available yet"))
                : E.act("Invite")}
            </div>
            {model.portalUsers.length ? <div className="flex flex-col gap-3">
              {model.portalUsers.map(u => <div key={u.key}>
                {E.row(u.email, "", detail ? detail.revokePortalUser?.[u.key] : <RevokePortalUserControl name={u.email} />)}
              </div>)}
            </div> : <p className="py-6 text-sm font-medium">No portal users yet</p>}
          </section>}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Trading terms" className="py-5">
            <h2 className="mb-3 font-heading text-xl font-semibold">Trading terms</h2>
            <div className="flex flex-col gap-4">
              {E.pick("Sale channel", values.saleChannelId, (channels ?? model.channelOptions.map(name => ({ id: name, name }))).map(channel => ({ value: channel.id, label: channel.name })), { ...controls("saleChannelId"), required: true, displayValue: channels?.find(channel => channel.id === values.saleChannelId)?.name ?? values.saleChannelId })}
              {E.pick("Terms", values.paymentTerms, PAYMENT_TERMS.map(value => ({ value, label: PAYMENT_TERM_LABEL[value] })), { ...controls("paymentTerms"), displayValue: paymentTermLabel(values.paymentTerms) })}
              {E.pick("Tax treatment", values.taxTreatment, [{ value: "", label: "Inherit from channel" }, ...TAX_TREATMENTS.map(value => ({ value, label: sentenceCase(value) }))], { ...controls("taxTreatment"), displayValue: values.taxTreatment ? sentenceCase(values.taxTreatment) : "Inherit from channel" })}
            </div>
          </section>
          <section aria-label="Customer activity" className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Customer activity</h2>
            {E.nav("Orders", detail ? "Orders for this customer" : model.orders, "", undefined, detail?.ordersHref)}
            {E.row("Customer keg balance", detail ? "Kegs out and deposits held" : model.kegBalance, E.act("Open", "primary", detail?.kegHref))}
          </section>
        </div>
      </div>
      <form id={formId} onSubmit={event => { event.preventDefault(); onSave?.(values); }}>
        <CommandFormMessage error={error} />
        {footer !== undefined ? footer : canWrite ? <div className="flex justify-end"><Button disabled={busy}>{busy ? "Saving…" : "Save customer"}</Button></div> : null}
      </form>
      {removal && <section aria-label="Delete customer" className="mt-2 flex flex-col gap-4 border-t pt-5 @min-[48rem]:flex-row @min-[48rem]:items-center @min-[48rem]:justify-between">
        <div>
          <h2 className="text-sm font-medium">Delete customer</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only unused accounts can be deleted. Customer history stays protected.</p>
        </div>
        <div className="shrink-0 self-start">{removal}</div>
      </section>}
    </div>
  );
}
