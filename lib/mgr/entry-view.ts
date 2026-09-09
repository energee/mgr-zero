// lib/mgr/entry-view.ts — view-model for Sign in / Reset / Set password family.
export type EntryViewModel = {
  title: string;
  inputs: string[];
  field?: { label: string; value: string };
  primary: string;
  secondary?: string;
  link?: { label: string; to: string };
  info?: string;
  note?: string;
  extraPrimary?: string;
};

export function toEntryViewProps(s: EntryViewModel): EntryViewModel {
  return s;
}
