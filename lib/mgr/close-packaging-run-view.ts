// lib/mgr/close-packaging-run-view.ts — view-model for Close packaging run.
export type ClosePackagingRunViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  source?: string;
  needRows?: [string, string, string][];
  shortNote?: string;
  packaged?: string;
  lot?: string;
  lotOptions?: string[];
  destination?: string;
  destinationOptions?: string[];
  labelsDamaged?: string;
  endsDamaged?: string;
  writeOff?: string;
  writeOffOptions?: string[];
  tape?: [string, string][];
};

export function toClosePackagingRunViewProps(s: ClosePackagingRunViewModel): ClosePackagingRunViewModel {
  return s;
}
