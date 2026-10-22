// app/(app)/pick/print-button.tsx — triggers the browser print dialog. The
// @media print rule in app/globals.css hides the shell chrome (header, tab
// bar, rail) for output. With nothing to print it is withheld, and `reason`
// (pickSheetPrintReason) is shown beside it and linked to it (#1128).
"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton({ reason }: { reason: string | null }) {
  const reasonId = useId();
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
      {reason ? <p id={reasonId} className="text-sm text-muted-foreground">{reason}</p> : null}
      <Button size="sm" variant="outline" disabled={Boolean(reason)} aria-describedby={reason ? reasonId : undefined} onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
