// lib/mgr/vendor-view.ts — view-model for Vendor (inventory sheet).
export type VendorViewModel = {
  name: string;
  email: string;
  phone: string;
  terms: string;
  termsOptions: string[];
  leadDays: string;
};
