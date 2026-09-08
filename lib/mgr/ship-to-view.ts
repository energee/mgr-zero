// lib/mgr/ship-to-view.ts — view-model for the Ship-to form sheet.
export type ShipToViewModel = {
  title: string;
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
};

export type ShipToSnapshot = {
  label: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  isDefault?: boolean;
};

export function toShipToViewProps(s: ShipToSnapshot): ShipToViewModel {
  return {
    title: `${s.label} ship-to`,
    label: s.label,
    address: s.address1,
    city: s.city,
    state: s.state,
    zip: s.zip,
    isDefault: Boolean(s.isDefault),
  };
}
