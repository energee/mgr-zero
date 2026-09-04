// components/mgr/me-sheet.tsx — the header "Me" control (plan §3): who I am,
// which brewery, light/dark, sign out. Bottom sheet on phones, right sheet at
// md+ (hooks/use-mobile.ts). The brewery switcher arrives with SaaS mode.
// `avatar` swaps the UserCircle icon for a person's photo. The schema has no
// avatar column, so the app passes nothing and only the design inventory
// (screen-frame.tsx, which owns every other gallery fixture) supplies one.
"use client";

import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Icon } from "@/components/mgr/icon";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { UserAvatar } from "@/components/mgr/user-avatar";
import { UserCircleIcon } from "@hugeicons/core-free-icons";
import { useIsMobile } from "@/hooks/use-mobile";

export function MeSheet({ fields, avatar }: { fields: [string, string][]; avatar?: { src: string; name: string } }) {
  const mobile = useIsMobile();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Me">{avatar ? <UserAvatar {...avatar} className="size-5 text-[0.6rem]" /> : <Icon icon={UserCircleIcon} />}Me</Button>
      </SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"} className="pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="flex-row items-center gap-3">
          {avatar ? <UserAvatar {...avatar} className="size-10" /> : null}
          <SheetTitle>Me</SheetTitle>
        </SheetHeader>
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
