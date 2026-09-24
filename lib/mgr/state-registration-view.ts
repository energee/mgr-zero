// lib/mgr/state-registration-view.ts — view-model for State registration
// sheet. Opened from one brand, so the brand is stated, not picked.
export type StateRegistrationViewModel = {
  brand: string;
  state: string;
  registrationNo?: string;
  expiresOn?: string;
};

/** The upsert_state_registration input from the sheet's fields. The upsert
 *  replaces the whole row, so an edit sends back the approval date the sheet
 *  does not show; omitting it would clear it (#438). */
export function registrationInput(
  brandId: string,
  f: { state: string; registrationNo: string; expiresOn: string },
  existing?: { approved_on: string | null },
) {
  return {
    brandId, state: f.state.toUpperCase(),
    registrationNo: f.registrationNo || undefined, expiresOn: f.expiresOn || undefined,
    approvedOn: existing?.approved_on ?? undefined,
  };
}
