// lib/mgr/fixtures/customers.ts — list_customers / get_customer snapshots
// for the Customers inventory frames. Identities from demo.ts.
import { ALS, RIDGELINE } from "./demo";
import type { CustomersSnapshot } from "@/lib/mgr/customers-view";
import type { CustomerSnapshot } from "@/lib/mgr/customer-view";
import type { ShipToSnapshot } from "@/lib/mgr/ship-to-view";

const CUST_RIDGELINE = "00000000-0000-4000-8000-0000000000c1";
const CUST_ALS = "00000000-0000-4000-8000-0000000000c2";
const CHANNEL_WHOLESALE = "00000000-0000-4000-8000-0000000000e1";

/** Work → Customers list: Ridgeline plus Al’s remits warning. */
export const customersList: CustomersSnapshot = {
  customers: [
    {
      id: CUST_RIDGELINE,
      name: RIDGELINE.name,
      type: "retailer",
      state: "PA",
      payment_terms: "net30",
      sale_channels: { name: "Wholesale" },
      portal_user_count: 2,
    },
    {
      id: CUST_ALS,
      name: ALS.name,
      type: "retailer",
      state: "OH",
      payment_terms: "net15",
      sale_channels: { name: "Wholesale" },
      remit: "brewery remits",
    },
  ],
};

export const customersMissingEmail: CustomersSnapshot = {
  missingPortalEmail: true,
  customers: customersList.customers.map(customer => ({ ...customer, portal_user_count: 0 })),
};

/** Ridgeline account for Customer detail. */
export const customerRidgeline: CustomerSnapshot = {
  customer: {
    id: CUST_RIDGELINE,
    name: RIDGELINE.name,
    type: "retailer",
    state: "PA",
    license_no: "PA R-55821",
    payment_terms: "net30",
    sale_channel_id: CHANNEL_WHOLESALE,
    sale_channels: { name: "Wholesale" },
    tax_treatment: null,
  },
  shipTos: [{ label: "Main" }, { label: "Dock" }],
  channels: [
    { id: CHANNEL_WHOLESALE, name: "Wholesale" },
    { id: "00000000-0000-4000-8000-0000000000e2", name: "Taproom" },
    { id: "00000000-0000-4000-8000-0000000000e3", name: "DTC" },
    { id: "00000000-0000-4000-8000-0000000000e4", name: "Export" },
  ],
  portalUsers: [
    { userId: "00000000-0000-4000-8000-0000000000d1", email: "jordan@ridgelinetap.com" },
    { userId: "00000000-0000-4000-8000-0000000000d2", email: "orders@ridgelinetap.com" },
  ],
  kegs: { out: 38, depositCents: 114000 },
  orders: { open: 3, total: 42 },
};

/** Main ship-to sheet. */
export const shipToMain: ShipToSnapshot = {
  label: "Main",
  address1: "114 Bridge St",
  city: "Phoenixville",
  state: "PA",
  zip: "19460",
  isDefault: true,
};
