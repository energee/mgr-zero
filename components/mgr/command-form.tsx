// components/mgr/command-form.tsx — the one surface every command form
// opens in (plan §6): a bottom Sheet on phones, a centered dialog card at md
// and up. Pairs with lib/commands/use-command-form.ts (open/setOpen/submit/
// error) but is presentational, so forms with bespoke state use it the same
// way. Always titled. Uses viewport md: because the sheet portals out of any
// container.
"use client";

import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function CommandForm({
  open,
  onOpenChange,
  trigger,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[90svh] gap-0 overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]",
          "md:inset-x-0 md:top-1/2 md:bottom-auto! md:mx-auto md:w-full md:max-w-md md:-translate-y-1/2 md:rounded-xl md:border md:pb-4",
        )}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

/** Action row at the bottom of a CommandForm body. */
export function CommandFormFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <SheetFooter className={cn("p-0 pt-2 md:flex-row md:justify-end", className)} {...props} />;
}
