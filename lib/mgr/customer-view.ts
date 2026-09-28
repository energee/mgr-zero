// lib/mgr/customer-view.ts — view-model for Customer detail (get_customer).
import { money } from "./money";
import { paymentTermLabel, sentenceCase } from "./labels";

/** The stored values the shared Customer detail form edits and saves. */
export type CustomerEditValues = { name: string; type: string; state: string; saleChannelId: string; licenseNumber: string; paymentTerms: string; taxTreatment: string };

export type CustomerViewModel = {
  backHref?: string;
  name: string;
  state: string;
  type: string;
  license: string;
  terms: string;
  channel: string;
  /** Sale channels the edit form offers, by id. */
  channelOptions: { id: string; name: string }[];
  taxTreatment: string;
  /** Stored values seeding the edit form, built from the raw row, not the labels above. */
  editValues: CustomerEditValues;
  shipTos: string;
  /** Buyers with portal access, by email; `key` is the portal user's userId. */
  portalUsers: { key: string; email: string }[];
  kegBalance: string;
  orders: string;
};

function titleType(type: string): string {
  if (type === "retailer") return "Retailer";
  if (type === "distributor") return "Distributor";
  return type;
}

export type CustomerSnapshot = {
  customer: {
    id: string;
    name: string;
    type: string;
    state: string;
    license_no: string | null;
    payment_terms: string | null;
    sale_channel_id: string;
    sale_channels: { name: string } | null;
    tax_treatment?: string | null;
  };
  shipTos: { label: string }[];
  /** list_sale_channels rows. */
  channels: { id: string; name: string }[];
  /** list_customer_users rows. */
  portalUsers?: { userId: string; email: string }[];
  kegs?: { out: number; depositCents: number };
  orders?: { open: number; total: number };
  backHref?: string;
};

export function toCustomerViewProps({
  customer,
  shipTos,
  channels,
  portalUsers,
  kegs,
  orders,
  backHref,
}: CustomerSnapshot): CustomerViewModel {
  const tax = customer.tax_treatment ? sentenceCase(customer.tax_treatment) : "Inherit from channel";
  return {
    backHref,
    name: customer.name,
    state: customer.state,
    type: titleType(customer.type),
    license: customer.license_no ?? "",
    terms: customer.payment_terms ? paymentTermLabel(customer.payment_terms) : "",
    channel: customer.sale_channels?.name ?? "",
    channelOptions: channels,
    taxTreatment: tax,
    editValues: {
      name: customer.name, type: customer.type, state: customer.state, saleChannelId: customer.sale_channel_id,
      licenseNumber: customer.license_no ?? "", paymentTerms: customer.payment_terms ?? "net30", taxTreatment: customer.tax_treatment ?? "",
    },
    shipTos: shipTos.map((s) => s.label).join(" · ") || "none",
    portalUsers: (portalUsers ?? []).map((u) => ({ key: u.userId, email: u.email })),
    kegBalance: kegs
      ? `${kegs.out} out · ${money(kegs.depositCents)} deposits held`
      : "kegs out and deposits held",
    orders: orders ? `${orders.open} open · ${orders.total} total` : "orders",
  };
}
