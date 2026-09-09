// lib/mgr/denied-view.ts — view-model for Permission denied (deniedCopy).
export type DeniedViewModel = {
  backHref?: string;
  note: string;
  signedInAs: string;
  needs: string;
  hint: string;
};

export function toDeniedViewProps(s: DeniedViewModel): DeniedViewModel {
  return s;
}
