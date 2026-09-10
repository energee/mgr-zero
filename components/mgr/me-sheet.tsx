// components/mgr/me-sheet.tsx — the header "Me" control (plan §3; screen
// records Me and Portal Me): who I am, which brewery, light/dark, change
// password, sign out. Bottom sheet on phones, right sheet at md+
// (hooks/use-mobile.ts). The brewery switcher renders only when the account
// holds more than one membership (`breweries`); the portal passes none.
// `avatar` swaps the UserCircle icon for the person: their photo, or their
// initials when `src` is omitted. The schema has no avatar column, so the app
// passes nothing and only the design inventory (screen-frame.tsx, which owns
// every other gallery fixture) supplies one.
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { logout, switchBrewery } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Icon } from "@/components/mgr/icon";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { UserAvatar } from "@/components/mgr/user-avatar";
import { UserCircleIcon } from "@hugeicons/core-free-icons";
import { useIsMobile } from "@/hooks/use-mobile";

export function MeSheet({ fields = [], avatar, breweries, signOut = "destructive", children }: {
  fields?: [string, string][];
  avatar?: { src?: string; name: string };
  /** Every brewery the account may operate as; the switcher shows with two or more. */
  breweries?: { id: string; name: string; current: boolean }[];
  /** Staff Me is destructive (plan §3 follow-up); portal Me stays outline. */
  signOut?: "destructive" | "outline";
  children?: ReactNode;
}) {
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
        {children ?? <>
          <dl className="flex flex-col px-4 text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {breweries && breweries.length > 1 && (
            <div className="flex flex-col gap-1 px-4 text-sm">
              <h3 className="text-muted-foreground">Brewery</h3>
              {breweries.map((b) => (
                <form key={b.id} action={switchBrewery} className="flex items-center justify-between gap-2 py-1">
                  <input type="hidden" name="breweryId" value={b.id} />
                  <span>{b.name}</span>
                  {b.current ? <span className="text-muted-foreground">current</span> : <Button type="submit" variant="ghost" size="sm">Switch</Button>}
                </form>
              ))}
            </div>
          )}
          <MeSheetActions signOut={signOut} />
        </>}
      </SheetContent>
    </Sheet>
  );
}

export function MeSheetActions({ signOut = "destructive" }: { signOut?: "destructive" | "outline" }) {
  return (
    <div className="flex flex-col gap-2 px-4">
      <ThemeToggle />
      <Button variant="outline" asChild><Link href="/password">Change password</Link></Button>
      <form action={logout}>
        <Button type="submit" variant={signOut} className="w-full">Sign out</Button>
      </form>
    </div>
  );
}
