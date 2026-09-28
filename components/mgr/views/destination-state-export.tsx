"use client";

import { E } from "@/components/mgr/e";
import type { StateTransaction } from "@/lib/commands/compliance";
import { destinationStateCsv } from "@/lib/mgr/destination-state-export";

/** Builds the CSV only when clicked, from the facts the page already holds. */
export function DestinationStateExport({ periodStart, periodEnd, facts }: { periodStart: string; periodEnd: string; facts: StateTransaction[] }) {
  return E.btn("Export state transactions", "g", undefined, () => {
    const csv = destinationStateCsv(periodStart, periodEnd, facts);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `destination-states-${periodStart}-${periodEnd}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
}
