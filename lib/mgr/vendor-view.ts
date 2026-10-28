// lib/mgr/vendor-view.ts — view-model for Vendor (inventory sheet).
import { emailError } from "./email";
import { phoneError } from "./phone";
import { submitReason } from "./submit-reason";

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
  return { ...(email && { email }), ...(phone && { phone }), ...(leadDays && { leadDays }) };
}

/** Why Save vendor is withheld (#1485): a blank name, or an optional field
 *  vendorFieldErrors marks. Null when ready. */
export function vendorReason(fields: Pick<VendorViewModel, "name" | "email" | "leadDays" | "phone">): string | null {
  const errors = vendorFieldErrors(fields);
  return submitReason([
    !fields.name.trim() && "a vendor name", errors.email && "a valid email", errors.phone && "a valid phone number",
    errors.leadDays && "a lead time of zero or more whole days",
  ].filter((need): need is string => Boolean(need)));
}
