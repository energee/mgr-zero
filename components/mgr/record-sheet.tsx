// components/mgr/record-sheet.tsx — one record (an order) opened over the list
// it was picked from, so the list stays where it was: a sheet from the right
// edge, the full width of a phone and a wide column on the desk. It overlays
// the page rather than docking beside it. Presentational: the live order sheet
// (components/mgr/order-sheet-link.tsx) closes it through the address, and the
// screen inventory passes no onClose, so its frame stays open.
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function RecordSheet({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      {/* aria-describedby: the record itself is the description, so the sheet names none. */}
      <SheetContent side="right" aria-describedby={undefined} className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        {/* The record draws its own visible heading; the sheet's title names the surface for a screen reader. */}
        <SheetHeader className="sr-only"><SheetTitle>{title}</SheetTitle></SheetHeader>
        {/* pt-12 keeps the record's header actions clear of the sheet's Close button. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-12 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
