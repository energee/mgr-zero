// lib/mgr/ship-to-view.ts — view-model for the Ship-to form sheet. A missing
// (null) street, city, state or zip reads as an empty field: outside the US
// only the label is required.
import { countryName } from "./labels";

export type ShipToViewModel = {
  title: string;
  label: string;
  /** ISO code; the form draws State only for "US". */
  country: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
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
};

export function toShipToViewProps(s: ShipToSnapshot): ShipToViewModel {
  return {
    title: `${s.label || "New"} ship-to`,
    label: s.label,
    country: s.country,
    address: s.address1 ?? "",
    address2: s.address2 ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    zip: s.zip ?? "",
    isDefault: Boolean(s.isDefault),
  };
}

/** A ship-to as one line: street, then the city, state and zip, then the
 *  country outside the US. Missing parts drop out, so a foreign ship-to with
 *  no address reads as its country. Screens that show only the place (order,
 *  portal, delivery) pass no street or zip. */
export type ShipToAddressParts = { country: string } & Partial<Record<"address1" | "address2" | "city" | "state" | "zip", string | null>>;

export function shipToAddress(s: ShipToAddressParts): string {
  const street = [s.address1, s.address2].filter(Boolean).join(", ");
  const place = [[s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(" ");
  return [street, place, s.country === "US" ? "" : countryName(s.country)].filter(Boolean).join(" · ");
}
