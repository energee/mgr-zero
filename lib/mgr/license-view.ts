// lib/mgr/license-view.ts — view-model for License sheet.
export type LicenseViewModel = {
  state: string;
  kind: string;
  licenseNo?: string;
  expiresOn?: string;
};

/** The upsert_brewery_state_license input from the sheet's fields. The upsert
 *  keeps the note the sheet does not show because it is omitted (#438, #522);
 *  an empty field is null so clearing it clears the saved value. */
export function licenseInput(f: { state: string; kind: string; licenseNo: string; expiresOn: string }) {
  return { state: f.state.toUpperCase(), kind: f.kind, licenseNo: f.licenseNo || null, expiresOn: f.expiresOn || null };
}
