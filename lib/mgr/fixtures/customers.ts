// lib/mgr/fixtures/customers.ts — list_customers / get_customer snapshots
// for the Customers inventory frames. Identities from demo.ts.
import { ALS, RIDGELINE } from "./demo";
import type { CustomersSnapshot } from "@/lib/mgr/customers-view";
import type { CustomerSnapshot } from "@/lib/mgr/customer-view";
import type { ShipToSnapshot } from "@/lib/mgr/ship-to-view";

const CUST_RIDGELINE = "00000000-0000-4000-8000-0000000000c1";
const CUST_ALS = "00000000-0000-4000-8000-0000000000c2";

/** Work → Customers list: Ridgeline plus Al’s remits warning. */
export const customersList: CustomersSnapshot = {
  customers: [
    {
      id: CUST_RIDGELINE,
      name: RIDGELINE.name,
      type: "retailer",
      state: "PA",
      payment_terms: "Net 30",
      sale_channels: { name: "Wholesale" },
      portal_user_count: 2,
    },
    {
      id: CUST_ALS,
      name: ALS.name,
      type: "retailer",
      state: "OH",
      payment_terms: "Net 15",
      sale_channels: { name: "Wholesale" },
      remit: "brewery remits",
    },
  ],
};

/** Ridgeline account for Customer detail. */
export const customerRidgeline: CustomerSnapshot = {
  customer: {
    id: CUST_RIDGELINE,
    name: RIDGELINE.name,
    type: "retailer",
    state: "PA",
    license_no: "PA R-55821",
    payment_terms: "Net 30",
    sale_channels: { name: "Wholesale" },
    tax_treatment: null,
  },
  shipTos: [{ label: "Main" }, { label: "Dock" }],
  portalUserCount: 2,
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
