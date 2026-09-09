// lib/mgr/license-view.ts — view-model for License sheet.
export type LicenseViewModel = {
  state: string;
  kind: string;
  licenseNo?: string;
  expiresOn?: string;
};

export function toLicenseViewProps(s: LicenseViewModel): LicenseViewModel {
  return s;
}
