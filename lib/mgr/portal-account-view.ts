// lib/mgr/portal-account-view.ts — view-model for portal Account.
// Maps get_portal_account onto PortalAccountView. Empty deposits omit rows.
import { money } from "./money";

export type PortalAccountShipToView = {
  key: string;
  title: string;
  detail: string;
};

export type PortalAccountMembershipView = {
  title: string;
  detail: string;
  trailing: string;
};

export type PortalAccountDepositView = {
  key: string;
  title: string;
  detail: string;
  amount: string;
};

export type PortalAccountViewModel = {
  customer: string;
  shipTos: PortalAccountShipToView[];
  membership: PortalAccountMembershipView;
  deposits: PortalAccountDepositView[];
  info: string;
};

/** get_portal_account payload. */
export type PortalAccountSnapshot = {
  customer: { id: string; name: string };
  shipTos: { id: string; label: string; city: string; state: string; is_default?: boolean }[];
  membership: { userId: string };
  deposits: { kegSize: string | null; kegsOnDeposit: number; depositCents: number }[];
};

/** Map a get_portal_account payload onto PortalAccountView. */
export function toPortalAccountViewProps({
  customer,
  shipTos,
  deposits,
}: PortalAccountSnapshot): PortalAccountViewModel {
  return {
    customer: customer.name,
    shipTos: shipTos.map((s) => ({
      key: s.id,
      title: `${s.label} ship-to${s.is_default ? " · default" : ""}`,
      detail: `${s.city}, ${s.state}`,
    })),
    membership: { title: "You · buyer", detail: "this login", trailing: "active" },
    deposits: deposits.filter((d) => d.kegsOnDeposit !== 0).map((d) => ({
      key: d.kegSize ?? "all",
      title: "Keg deposits held",
      detail: `${d.kegsOnDeposit} × ${d.kegSize ?? "keg"}`,
      amount: money(d.depositCents),
    })),
    info: "Contact the brewery to change account details.",
  };
}
