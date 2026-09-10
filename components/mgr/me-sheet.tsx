// components/mgr/me-sheet.tsx — the header "Me" control (plan §3; screen
// records Me and Portal Me): who I am, which brewery, change password, sign
// out. Uses the same centered dialog at every viewport. Its children are the
// shared staff or portal view; live layouts supply data and actions.
// `avatar` swaps the UserCircle icon for the person: their photo, or their
// initials when `src` is omitted. The schema has no avatar column, so the app
// passes nothing and only the design inventory (screen-frame.tsx, which owns
// every other gallery fixture) supplies one.
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Icon } from "@/components/mgr/icon";
import { UserAvatar } from "@/components/mgr/user-avatar";
import { UserCircleIcon } from "@hugeicons/core-free-icons";

export function MeSheet({ avatar, children, open, onOpenChange }: {
  avatar?: { src?: string; name: string };
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Me">{avatar ? <UserAvatar {...avatar} className="size-5 text-[0.6rem]" /> : <Icon icon={UserCircleIcon} />}Me</Button>
      </DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Me</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function MeSheetActions() {
  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
      <Button variant="outline" className="w-full md:w-fit md:self-end" asChild><Link href="/password">Change password</Link></Button>
      <form action={logout}>
        <Button type="submit" variant="destructive" className="w-full bg-destructive! text-destructive-foreground! hover:bg-destructive/90! md:w-fit md:self-end">Sign out</Button>
      </form>
    </div>
  );
}
