// lib/mgr/ship-to-view.ts — view-model for the Ship-to form sheet. A missing
// (null) street, city, state or zip reads as an empty field: outside the US
// only the label is required; a US ship-to also needs its state.
import { countryName } from "./labels";
import { customerStateReason } from "./customer-view";
import { submitReason } from "./submit-reason";

/** A US ZIP code or ZIP+4; upsert_ship_to refuses any other US postal code. */
export const US_ZIP = /^\d{5}(-\d{4})?$/;
export const US_ZIP_CORRECTION = "Use a 5-digit ZIP code or ZIP+4, such as 15201 or 15201-1234.";

export type ShipToViewModel = {
  label: string;
  /** ISO code; the form draws State only for "US". */
  country: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
  /** Set when another of the customer's ship-tos has this label. */
  labelError?: string;
};

export type ShipToSnapshot = {
  label: string;
  country: string;
  address1: string | null;
  address2?: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isDefault?: boolean;
  /** The ship-to being edited, so its own label is not a duplicate. */
  id?: string;
  /** The customer's loaded ship-tos. Nothing in the database refuses a
   *  duplicate label, so the form checks against these. */
  shipTos?: readonly { id: string; label: string }[];
};

export function toShipToViewProps(s: ShipToSnapshot): ShipToViewModel {
  const label = s.label.trim().toLowerCase();
  const duplicate = label ? s.shipTos?.find(other => other.id !== s.id && other.label.trim().toLowerCase() === label) : undefined;
  return {
    label: s.label,
    country: s.country,
    address: s.address1 ?? "",
    address2: s.address2 ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    zip: s.zip ?? "",
    isDefault: Boolean(s.isDefault),
    labelError: duplicate ? `A ship-to labeled ${duplicate.label.trim()} already exists for this customer.` : undefined,
  };
}

/** The ZIP correction for a US postal code that is entered but invalid. */
export function shipToZipError(m: Pick<ShipToViewModel, "country" | "zip">): string | undefined {
  const zip = m.zip.trim();
  return m.country === "US" && zip && !US_ZIP.test(zip) ? US_ZIP_CORRECTION : undefined;
}

/** Why Save ship-to is withheld: a blank or duplicate label, a missing US
 *  state, or an invalid US ZIP. Street, city and ZIP may stay blank. */
export function shipToReason(m: ShipToViewModel): string | null {
  return submitReason([
    ...(!m.label.trim() ? ["a label"] : []),
    ...(m.labelError ? ["a label no other ship-to uses"] : []),
    ...(customerStateReason(m) ? ["a state"] : []),
    ...(shipToZipError(m) ? ["a 5-digit ZIP code or ZIP+4"] : []),
  ]);
}

/** A ship-to row as get_customer returns it. */
export type ShipToRecord = {
  label: string; country: string; address1: string | null; address2: string | null;
  city: string | null; state: string | null; zip: string | null; is_default: boolean;
};

/** The ship-to form's starting fields. Editing keeps the ship-to's own
 *  values; a new ship-to is blank and starts in the customer's country, so a
 *  ship-to for a Japanese customer does not default to the United States. */
export function shipToFormFields(shipTo: ShipToRecord | undefined, customerCountry: string) {
  return {
    label: shipTo?.label ?? "", country: shipTo?.country ?? customerCountry, address1: shipTo?.address1 ?? "", address2: shipTo?.address2 ?? "",
    city: shipTo?.city ?? "", state: shipTo?.state ?? "", zip: shipTo?.zip ?? "", isDefault: shipTo?.is_default ?? false,
  };
}

/** A ship-to as one line: street, then the city, state and zip, then the
 *  country outside the US. Missing parts drop out, so a foreign ship-to with
 *  no address reads as its country. Callers that only show the place (such
 *  as order summaries) may omit street and zip. */
export type ShipToAddressParts = { country: string } & Partial<Record<"address1" | "address2" | "city" | "state" | "zip", string | null>>;

export function shipToAddress(s: ShipToAddressParts): string {
  const street = [s.address1, s.address2].filter(Boolean).join(", ");
  const place = [[s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(" ");
  return [street, place, s.country === "US" ? "" : countryName(s.country)].filter(Boolean).join(" · ");
}
