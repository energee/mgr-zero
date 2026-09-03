// components/mgr/command-form.tsx — the one surface every command form
// opens in (plan §6): a bottom Sheet on phones, a Dialog at md and up,
// switched on hooks/use-mobile.ts exactly as shadcn's Sidebar does. Pairs
// with lib/commands/use-command-form.ts (open/setOpen/submit/error) but is
// presentational, so forms with bespoke state use it the same way. Always
// titled. Content is closed on first paint, so the SSR "not mobile" snapshot
// never renders the wrong primitive.
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function CommandForm({
  open,
  onOpenChange,
  trigger,
  title,
  children,
}: {
  open: boolean;
  /** Omit to pin the form open (the design gallery); dismiss gestures then do nothing. */
  onOpenChange?: (open: boolean) => void;
  /** Omit when the caller controls `open` itself (the design gallery). */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  if (useIsMobile()) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="pb-0">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="px-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Action row at the bottom of a CommandForm body: stacked on phone, right-aligned on desk. */
export function CommandFormFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 pt-2 md:flex-row md:justify-end", className)} {...props} />;
}
