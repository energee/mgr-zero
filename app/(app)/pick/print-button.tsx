// app/(app)/pick/print-button.tsx — triggers the browser print dialog. The
// @media print rule in app/globals.css hides the nav sidebar for output.
"use client";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()}>
      Print
    </Button>
  );
}
