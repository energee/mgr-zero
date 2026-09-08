// lib/mgr/customer-view.ts — view-model for Customer detail (get_customer).
import { money } from "./money";

export type CustomerViewModel = {
  backHref?: string;
  name: string;
  state: string;
  type: string;
  typeOptions: string[];
  license: string;
  terms: string;
  channel: string;
  channelOptions: string[];
  taxTreatment: string;
  taxOptions: string[];
  shipTos: string;
  portalUsers: string;
  kegBalance: string;
  orders: string;
};

const TYPES = ["Retailer", "Distributor"];
const CHANNELS = ["Wholesale", "Taproom", "DTC", "Export"];
const TAX = ["Inherit from channel", "taxable", "export", "vessel supplies", "research", "transfer in bond"];

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
    sale_channels: { name: string } | null;
    tax_treatment?: string | null;
  };
  shipTos: { label: string }[];
  portalUserCount?: number;
  kegs?: { out: number; depositCents: number };
  orders?: { open: number; total: number };
  backHref?: string;
};

export function toCustomerViewProps({
  customer,
  shipTos,
  portalUserCount,
  kegs,
  orders,
  backHref,
}: CustomerSnapshot): CustomerViewModel {
  const tax = customer.tax_treatment
    ? customer.tax_treatment.replaceAll("_", " ")
    : "Inherit from channel";
  return {
    backHref,
    name: customer.name,
    state: customer.state,
    type: titleType(customer.type),
    typeOptions: TYPES,
    license: customer.license_no ?? "",
    terms: customer.payment_terms ?? "",
    channel: customer.sale_channels?.name ?? "",
    channelOptions: CHANNELS,
    taxTreatment: tax,
    taxOptions: TAX,
    shipTos: shipTos.map((s) => s.label).join(" · ") || "none",
    portalUsers: portalUserCount == null ? "none" : `${portalUserCount} active`,
    kegBalance: kegs
      ? `${kegs.out} out · ${money(kegs.depositCents)} deposits held`
      : "kegs out and deposits held",
    orders: orders ? `${orders.open} open · ${orders.total} total` : "orders",
  };
}
