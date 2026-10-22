// app/(app)/pick/print-button.tsx — triggers the browser print dialog. The
// @media print rule in app/globals.css hides the shell chrome (header, tab
// bar, rail) for output. With nothing to print it is withheld, and `reason`
// (pickSheetPrintReason) is shown beside it and linked to it (#1128), through
// the same SubmitButton every withheld form button uses.
"use client";

import { SubmitButton } from "@/components/mgr/submit-button";

export function PrintButton({ reason }: { reason: string | null }) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
      <SubmitButton type="button" label="Print" reason={reason} size="sm" variant="outline" onClick={() => window.print()} />
    </div>
  );
}
