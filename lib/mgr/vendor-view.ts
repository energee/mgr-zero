// lib/mgr/vendor-view.ts — view-model for Vendor (inventory sheet).
import { emailError } from "./email";
import { phoneError } from "./phone";

export type VendorViewModel = {
  name: string;
  email: string;
  phone: string;
  terms: string;
  termsOptions: string[];
  leadDays: string;
  /** Null until the vendor has been saved. */
  active: boolean | null;
};

export function vendorFieldErrors(fields: Pick<VendorViewModel, "email" | "leadDays" | "phone">): { email?: string; phone?: string; leadDays?: string } {
  const email = fields.email === "" ? undefined : emailError(fields.email);
  const phone = phoneError(fields.phone);
  const days = Number(fields.leadDays);
  let leadDays: string | undefined;
  if (/[eE]/.test(fields.leadDays)) leadDays = "Enter a decimal number without exponent notation.";
  else if (fields.leadDays !== "" && (!Number.isInteger(days) || days < 0)) leadDays = "Enter a whole number of days, zero or more.";
  else if (days > 2_147_483_647) leadDays = "Enter a lead time no greater than 2,147,483,647 days."; // vendors.lead_time_days is int
  return { ...(email && { email }), ...(phone && { phone }), ...(leadDays && { leadDays }) };
}
