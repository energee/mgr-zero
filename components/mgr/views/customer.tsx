"use client";

// Customer detail shares inline account and trading-term edits. Live supplies
// persisted values, permission, command callbacks, and authorized activity slots.
import { useState, useId, type ReactNode } from "react";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PAYMENT_TERMS } from "@/lib/mgr/enums";
import { COUNTRY_OPTIONS, CUSTOMER_TYPE_OPTIONS, PAYMENT_TERM_LABEL, sentenceCase } from "@/lib/mgr/labels";
import { TAX_TREATMENTS } from "@/lib/mgr/tax-treatments";
import { E, type FieldControls } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { UsStateField } from "@/components/mgr/us-state-field";
import { CUSTOMER_ALIAS_HELP, customerNameError, customerStateReason, type CustomerEditValues, type CustomerViewModel } from "@/lib/mgr/customer-view";
import { submitReason } from "@/lib/mgr/submit-reason";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { DeleteCustomerControl } from "./delete-customer";
import { RevokePortalUserControl } from "./revoke-portal-user";

const TERMS_OPTIONS = PAYMENT_TERMS.map(value => ({ value, label: PAYMENT_TERM_LABEL[value] }));
const TAX_OPTIONS = [{ value: "", label: "Inherit sale channel" }, ...TAX_TREATMENTS.map(value => ({ value, label: sentenceCase(value) }))];

/** Shared by the new-customer dialog and inline customer detail. */
export function CustomerSaleChannelField({ value, channels, controls }: { value: string; channels: { id: string; name: string }[]; controls: FieldControls }): ReactNode {
  const helpId = controls.id ? `${controls.id}-help` : undefined;
  return E.pick("Sale channel", value, channels.map(channel => ({ value: channel.id, label: channel.name === "DTC" ? "Direct to consumer (DTC)" : channel.name })), {
    ...controls,
    required: true,
    "aria-describedby": helpId,
    description: <FieldDescription id={helpId}>The sale channel sets prices and the default tax treatment. An Export channel does not override a customer’s tax treatment.</FieldDescription>,
  });
}

export function CustomerTaxTreatmentField({ value, controls }: { value: string; controls: FieldControls }): ReactNode {
  const helpId = controls.id ? `${controls.id}-help` : undefined;
  return E.pick("Tax treatment", value, TAX_OPTIONS, {
    ...controls,
    "aria-describedby": helpId,
    description: <FieldDescription id={helpId}>Inherit the channel default or override it for this customer. Export tax treatment means shipment outside the US without payment of tax.</FieldDescription>,
  });
}

export type CustomerDetailSlot = {
  /** `action` edits the ship-to; `remove` deletes it (live: a non-default ship-to only, #1487). */
  shipTos?: { key: string; title: string; detail: string; action?: ReactNode; remove?: ReactNode }[];
  addShipTo?: ReactNode;
  kegHref?: string;
  ordersHref?: string;
  /** Live sales/admin: New order with this customer filled in (#1506). */
  newOrderHref?: string;
  /** Live: the Invoices register filtered to this customer, the Open balance line's link (#1585). */
  invoicesHref?: string;
  /** Live sales/admin: InviteForm. `null` hides the whole Portal users section. */
  portalUsers?: ReactNode;
  /** Live sales/admin: the Remove access verb per portal user, keyed by userId
   *  (the model's portalUsers `key`). A map, not a callback, because this view
   *  is a client component and the page renders the verbs on the server. */
  revokePortalUser?: Record<string, ReactNode>;
};

export function CustomerView({
  model,
  footer,
  detail,
  deleteAction,
  canWrite = true, busy = false, error = null, onSave,
}: {
  model: CustomerViewModel;
  footer?: ReactNode;
  /** Live activity and access controls around the shared edit fields. */
  detail?: CustomerDetailSlot;
  deleteAction?: ReactNode;
  canWrite?: boolean;
  busy?: boolean;
  error?: string | null;
  onSave?: (values: CustomerEditValues) => void;
}) {
  const formId = useId();
  const [values, setValues] = useState(model.editValues);
  const touched = useTouchedLines(!onSave);
  const nameError = customerNameError(values.name);
  const controls = (key: keyof CustomerEditValues) => ({ id: `${formId}-${key}`, form: formId, disabled: !canWrite || busy, onChange: (value: string) => setValues(current => ({ ...current, [key]: value })) });
  const removal = deleteAction !== undefined ? deleteAction : <DeleteCustomerControl name={model.name} />;
  const stateReason = customerStateReason(values);
  return (
    <div className="@container flex min-w-0 flex-col gap-6">
      <header className="min-w-0 [overflow-wrap:anywhere] [&_h1]:font-heading [&_h1]:text-2xl [&_h1]:tracking-tight @min-[48rem]:[&_h1]:text-3xl">
        {E.back("Customers", model.name, undefined, model.backHref)}
      </header>
      <div className="grid items-start gap-6 @min-[48rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Account details" className="py-5">
            <h2 className="mb-3 font-heading text-xl font-semibold">Account details</h2>
            <div className="flex flex-col gap-4">
              {E.edit("Customer name", values.name, "text", undefined, { ...controls("name"), required: true, onBlur: () => touched.touch(0), error: touched.shown(0) ? nameError : undefined })}
              <div className="flex min-w-0 flex-col gap-2">
                {E.edit("Alias", values.alias, "text", undefined, { ...controls("alias"), "aria-describedby": `${formId}-alias-help` })}
                <FieldDescription id={`${formId}-alias-help`}>{CUSTOMER_ALIAS_HELP}</FieldDescription>
              </div>
              {E.pick("Type", values.type, CUSTOMER_TYPE_OPTIONS, controls("type"))}
              {E.pick("Country", values.country, COUNTRY_OPTIONS, { ...controls("country"), required: true })}
              {values.country === "US"
                ? <UsStateField value={values.state} label="State (required)" controls={{ ...controls("state"), required: true }} />
                : E.edit("State", "Not applicable", "text", undefined, { ...controls("state"), disabled: true })}
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
                <div key={s.key}>{E.row(s.title, s.detail, s.remove ? <>{s.action}{s.remove}</> : s.action)}</div>
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
              <CustomerSaleChannelField value={values.saleChannelId} channels={model.channelOptions} controls={controls("saleChannelId")} />
              {E.pick("Payment terms", values.paymentTerms, TERMS_OPTIONS, controls("paymentTerms"))}
              <CustomerTaxTreatmentField value={values.taxTreatment} controls={controls("taxTreatment")} />
            </div>
          </section>
          <section aria-label="Customer activity" className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Customer activity</h2>
            {E.nav("Orders", detail ? "Orders for this customer" : model.orders, "", undefined, detail?.ordersHref)}
            {!detail || detail.newOrderHref ? E.nav("New order", "Start an order for this customer", "", undefined, detail?.newOrderHref) : null}
            {model.openBalance && E.nav("Open balance", model.openBalance, "", undefined, detail?.invoicesHref)}
            {E.nav("Customer keg balance", detail ? "Kegs out and deposits held" : model.kegBalance, "", undefined, detail?.kegHref)}
          </section>
        </div>
      </div>
      <form id={formId} onSubmit={event => {
        event.preventDefault();
        touched.touch(0);
        if (canWrite && !busy && !nameError && !stateReason) onSave?.(values);
      }}>
        <CommandFormMessage error={error} />
        {footer !== undefined ? footer : canWrite ? <div className="flex justify-end">{E.submit("Save customer", { submitting: busy, reason: submitReason([...(nameError ? ["a name"] : []), ...(stateReason ? ["a state"] : [])]) })}</div> : null}
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
