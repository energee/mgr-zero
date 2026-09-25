// components/mgr/views/customer.tsx — Customer detail drawing. Inventory
// paints edits + Save. Live passes a detail slot for flds + ship-tos with
// CustomerForm in the header and ShipToForm rows in that slot.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CustomerViewModel } from "@/lib/mgr/customer-view";
import { DeleteCustomerControl } from "./delete-customer";

export type { CustomerViewModel };

export type CustomerDetailSlot = {
  shipTos?: { key: string; title: string; detail: string; action?: ReactNode }[];
  addShipTo?: ReactNode;
  kegHref?: string;
  ordersHref?: string;
  /** Live sales/admin: InviteForm. `null` hides the gated placeholder. */
  portalUsers?: ReactNode;
};

export function CustomerView({
  model,
  headerAction,
  footer,
  detail,
  deleteAction,
}: {
  model: CustomerViewModel;
  headerAction?: ReactNode;
  footer?: ReactNode;
  /** Live: flds + ship-tos. Inventory omits this and draws the edit tree. */
  detail?: CustomerDetailSlot;
  deleteAction?: ReactNode;
}) {
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
            {detail ? <div className="divide-y">
              {E.fld("Type", model.type)}
              {E.fld("State", model.state)}
              {E.fld("License number", model.license || "Not provided")}
            </div> : <div className="flex flex-col gap-4">
              {E.edit("Customer name", model.name)}
              {E.pick("Type", model.type, model.typeOptions)}
              {E.edit("License number", model.license)}
            </div>}
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
          {detail?.portalUsers !== null && <section aria-label="Portal users" className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="min-w-0">
              <h2 className="font-heading text-xl font-semibold">Portal users</h2>
              <p className="mt-1 text-sm text-muted-foreground">Buyer access to orders and invoices.</p>
            </div>
            {detail
              ? ("portalUsers" in detail ? detail.portalUsers : E.gated("Portal users", "invitations aren’t available yet"))
              : E.row("Portal users", model.portalUsers, E.act("Invite"))}
          </section>}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Trading terms" className="py-5">
            <h2 className="mb-3 font-heading text-xl font-semibold">Trading terms</h2>
            {detail ? <div className="divide-y">
              {E.fld("Sale channel", model.channel)}
              {E.fld("Terms", model.terms || "Not provided")}
              {E.fld("Tax treatment", model.taxTreatment)}
            </div> : <div className="flex flex-col gap-4">
              {E.pick("Sale channel", model.channel, model.channelOptions)}
              {E.pick("Terms", model.terms, model.termsOptions)}
              {E.pick("Tax treatment", model.taxTreatment, model.taxOptions)}
            </div>}
          </section>
          <section aria-label="Customer activity" className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">Customer activity</h2>
            {E.nav("Orders", detail ? "Orders for this customer" : model.orders, "", undefined, detail?.ordersHref)}
            {E.row("Customer keg balance", detail ? "Kegs out and deposits held" : model.kegBalance, E.act("Open", "primary", detail?.kegHref))}
          </section>
        </div>
      </div>
      {footer !== undefined ? footer : (detail ? null : <div className="flex justify-end">{E.btn("Save customer")}</div>)}
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
