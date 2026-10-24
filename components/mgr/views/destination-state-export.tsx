"use client";

import { E } from "@/components/mgr/e";
import type { StateTransaction } from "@/lib/commands/compliance";
import { downloadCsv } from "@/lib/download-csv";
import { destinationStateCsv } from "@/lib/mgr/destination-state-export";

/** Builds the CSV only when clicked, from the facts the page already holds. */
export function DestinationStateExport({ periodStart, periodEnd, facts }: { periodStart: string; periodEnd: string; facts: StateTransaction[] }) {
  const empty = facts.length === 0;
  const onExport = empty ? undefined : () =>
    downloadCsv(`destination-states-${periodStart}-${periodEnd}.csv`, destinationStateCsv(periodStart, periodEnd, facts));
  return <>
    {empty ? E.info("No transactions in this period. Nothing to export.") : null}
    {E.btn("Export state transactions", empty ? "g disabled" : "g", undefined, onExport)}
  </>;
}
