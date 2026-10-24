// lib/mgr/vendor-view.ts — view-model for Vendor (inventory sheet).
import { emailError } from "./email";

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

export function vendorFieldErrors(fields: Pick<VendorViewModel, "email" | "leadDays">): { email?: string; leadDays?: string } {
  const email = fields.email === "" ? undefined : emailError(fields.email);
  const days = Number(fields.leadDays);
  let leadDays: string | undefined;
  if (/[eE]/.test(fields.leadDays)) leadDays = "Enter a decimal number without exponent notation.";
  else if (fields.leadDays !== "" && (!Number.isInteger(days) || days < 0)) leadDays = "Enter a whole number of days, zero or more.";
  return { ...(email && { email }), ...(leadDays && { leadDays }) };
}
