// lib/mgr/license-view.ts — view-model for License sheet.
export type LicenseViewModel = {
  state: string;
  kind: string;
  licenseNo?: string;
  expiresOn?: string;
};

/** The upsert_brewery_state_license input from the sheet's fields. The upsert
 *  replaces the whole row, so an edit sends back the note the sheet does not
 *  show; omitting it would clear it (#438). */
export function licenseInput(
  f: { state: string; kind: string; licenseNo: string; expiresOn: string },
  existing?: { note: string | null },
) {
  return {
    state: f.state.toUpperCase(), kind: f.kind,
    licenseNo: f.licenseNo || undefined, expiresOn: f.expiresOn || undefined,
    note: existing?.note ?? undefined,
  };
}
