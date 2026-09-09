// lib/mgr/state-registration-view.ts — view-model for State registration sheet.
export type StateRegistrationViewModel = {
  brand: string;
  brandOptions: string[];
  state: string;
  registrationNo?: string;
  expiresOn?: string;
};

export function toStateRegistrationViewProps(s: StateRegistrationViewModel): StateRegistrationViewModel {
  return s;
}
