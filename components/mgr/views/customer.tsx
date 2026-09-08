// components/mgr/views/customer.tsx — Customer detail drawing. Inventory
// paints edits + Save. Live passes a detail slot for flds + ship-tos with
// CustomerForm in the header and ShipToForm rows in that slot.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CustomerViewModel } from "@/lib/mgr/customer-view";

export type { CustomerViewModel };

export type CustomerDetailSlot = {
  shipTos?: { key: string; title: string; detail: string; action?: ReactNode }[];
  addShipTo?: ReactNode;
  kegHref?: string;
  /** Live sales/admin: InviteForm. `null` hides the gated placeholder. */
  portalUsers?: ReactNode;
};

export function CustomerView({
  model,
  headerAction,
  footer,
  detail,
}: {
  model: CustomerViewModel;
  headerAction?: ReactNode;
  footer?: ReactNode;
  /** Live: flds + ship-tos. Inventory omits this and draws the edit tree. */
  detail?: CustomerDetailSlot;
}) {
  return (
    <>
      {E.back("Customers", model.name, headerAction, model.backHref)}
      {detail ? (
        <>
          {E.fld("Type", model.type)}
          {E.fld("State", model.state)}
          {E.fld("License number", model.license || "none")}
          {E.fld("Terms", model.terms)}
          {E.fld("Sale channel", model.channel)}
          {E.ttl("Ship-tos")}
          {detail.shipTos?.map((s) => (
            <Fragment key={s.key}>{E.row(s.title, s.detail, s.action)}</Fragment>
          ))}
          {detail.addShipTo}
          {"portalUsers" in detail
            ? detail.portalUsers
            : E.gated("Portal users", "invitations aren’t available yet")}
          {E.row("Customer keg balance", "kegs out and deposits held", E.act("Open", "primary", detail.kegHref))}
        </>
      ) : (
        <>
          {E.edit("Customer name", model.name)}
          {E.pick("Type", model.type, model.typeOptions)}
          {E.edit("License number", model.license)}
          {E.edit("Terms", model.terms)}
          {E.pick("Sale channel", model.channel, model.channelOptions)}
          {E.pick("Tax treatment", model.taxTreatment, model.taxOptions)}
          {E.nav("Ship-tos", model.shipTos)}
          {E.row("Portal users", model.portalUsers, E.act("Invite"))}
          {E.nav("Customer keg balance", model.kegBalance)}
          {E.nav("Orders", model.orders)}
        </>
      )}
      {footer ?? (detail ? null : E.btn("Save customer"))}
    </>
  );
}
