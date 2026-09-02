// components/mgr/me-sheet.tsx — the header "Me" control (plan §3): who I am,
// which brewery, sign out. The layout passes the sign-out form in as a child
// so a server action stays server-side; the brewery switcher arrives with
// SaaS mode. Renders as a bottom sheet below md and a right sheet at md+.
"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { E } from "@/components/mgr/e";

export function MeSheet({ fields, children }: { fields: [string, string][]; children?: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-9">Me</Button>
      </SheetTrigger>
      {/* ponytail: viewport md, not container — the sheet portals out of the shell's @container */}
      <SheetContent side="bottom" className="gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-3/4 md:max-w-sm md:border-t-0 md:border-l">
        <SheetHeader className="p-0"><SheetTitle className="font-heading text-lg">Me</SheetTitle></SheetHeader>
        {fields.map(([k, v]) => <div key={k}>{E.fld(k, v)}</div>)}
        {children}
      </SheetContent>
    </Sheet>
  );
}
