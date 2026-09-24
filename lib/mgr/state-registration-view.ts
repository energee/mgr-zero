// lib/mgr/state-registration-view.ts — view-model for State registration
// sheet. Opened from one brand, so the brand is stated, not picked.
export type StateRegistrationViewModel = {
  brand: string;
  state: string;
  registrationNo?: string;
  expiresOn?: string;
};

/** The upsert_state_registration input from the sheet's fields. The upsert
 *  keeps the approval date the sheet does not show because it is omitted
 *  (#438, #522); an empty field is null so clearing it clears the saved value. */
export function registrationInput(brandId: string, f: { state: string; registrationNo: string; expiresOn: string }) {
  return { brandId, state: f.state.toUpperCase(), registrationNo: f.registrationNo || null, expiresOn: f.expiresOn || null };
}
