// lib/mgr/close-packaging-run-view.ts — view-model for Close packaging run.
export type ClosePackagingRunViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  brand?: string;
  plannedOn?: string;
  plannedOutputs?: [string, string | number, string | number][];
  showCloseReview?: boolean;
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
