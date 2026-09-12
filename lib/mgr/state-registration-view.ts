// lib/mgr/state-registration-view.ts — view-model for State registration
// sheet. Opened from one brand, so the brand is stated, not picked.
export type StateRegistrationViewModel = {
  brand: string;
  state: string;
  registrationNo?: string;
  expiresOn?: string;
};

export function toStateRegistrationViewProps(s: StateRegistrationViewModel): StateRegistrationViewModel {
  return s;
}
