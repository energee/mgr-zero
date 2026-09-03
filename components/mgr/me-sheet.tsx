// components/mgr/me-sheet.tsx — the header "Me" control (plan §3): who I am,
// which brewery, light/dark, sign out. Bottom sheet on phones, right sheet at
// md+ (hooks/use-mobile.ts). The brewery switcher arrives with SaaS mode.
"use client";

import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Icon } from "@/components/mgr/icon";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { UserCircleIcon } from "@hugeicons/core-free-icons";
import { useIsMobile } from "@/hooks/use-mobile";

export function MeSheet({ fields }: { fields: [string, string][] }) {
  const mobile = useIsMobile();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm"><Icon icon={UserCircleIcon} />Me</Button>
      </SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"} className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader><SheetTitle>Me</SheetTitle></SheetHeader>
        <dl className="flex flex-col px-4 text-sm">
          {fields.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2 px-4">
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">Sign out</Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
