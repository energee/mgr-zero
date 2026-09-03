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
  footer,
  children,
}: {
  open: boolean;
  /** Omit to pin the form open (the design gallery); dismiss gestures then do nothing. */
  onOpenChange?: (open: boolean) => void;
  /** Omit when the caller controls `open` itself (the design gallery). */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  /** Stays on screen; the body scrolls. Keypad sheets put the pad and verb here. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  // bleed: the dialog body and footer pull out to DialogContent's own padding so a focus ring and the divider reach the edge; the sheet has none to undo.
  const body = (bleed: string) => <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-1", bleed)}>{children}</div>;
  const foot = (bleed: string) => footer && <div className={cn("shrink-0 border-t px-4 pt-2", bleed)}>{footer}</div>;
  if (useIsMobile()) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent side="bottom" className="flex max-h-[90svh] flex-col overflow-hidden rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="shrink-0 pb-0">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {body("")}
          {foot("")}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body("-mx-4")}
        {foot("-mx-4")}
      </DialogContent>
    </Dialog>
  );
}

/** Action row at the bottom of a CommandForm body: stacked on phone, right-aligned on desk. */
export function CommandFormFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 pt-2 md:flex-row md:justify-end", className)} {...props} />;
}
