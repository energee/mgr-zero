// lib/mgr/state-registration-view.ts — view-model for State registration sheet.
export type StateRegistrationViewModel = {
  brandId: string;
  brand: string;
  brandOptions: { id: string; label: string }[];
  state: string;
  registrationNo?: string;
  expiresOn?: string;
};

export function toStateRegistrationViewProps(s: StateRegistrationViewModel): StateRegistrationViewModel {
  return s;
}
