// components/mgr/command-form.tsx — the one surface every command form
// opens in (plan §6): a bottom Sheet on phones, a Dialog at md and up,
// switched on hooks/use-mobile.ts exactly as shadcn's Sidebar does. Pairs
// with lib/commands/use-command-form.ts (open/setOpen/submit/error) but is
// presentational, so forms with bespoke state use it the same way. Always
// titled. Submit feedback goes through CommandFormMessage below so every form
// announces errors and warnings to assistive tech the same way. Content is
// closed on first paint, so the SSR "not mobile" snapshot never renders the
// wrong primitive.
"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
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
  container,
  children,
}: {
  open: boolean;
  /** Where the sheet or dialog portals to; the screen explorer keeps it inside its box. */
  container?: HTMLElement | null;
  /** Omit to pin the form open (the screen inventory's frames); dismiss gestures then do nothing. */
  onOpenChange?: (open: boolean) => void;
  /** Omit when the caller controls `open` itself (the screen inventory's frames). */
  trigger?: React.ReactNode;
  title: React.ReactNode;
  /** Stays on screen; the body scrolls. Quantity sheets put the commit verb here. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  // bleed: the dialog body and footer pull out to DialogContent's own padding so a focus ring and the divider reach the edge; the sheet has none to undo.
  const body = (bleed: string) => <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-1", bleed)}>{children}</div>;
  const foot = (bleed: string) => footer && <div className={cn("shrink-0 border-t px-4 pt-2", bleed)}>{footer}</div>;
  const mobile = useIsMobile();
  // Explorer-only portal plumbing belongs here, not in generated shadcn files.
  if (container) return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Content
          data-slot="dialog-content"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn("fixed z-50 flex flex-col gap-4 overflow-hidden rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10", mobile ? "inset-x-0 bottom-0 max-h-[calc(100%-1rem)]" : "top-1/2 left-1/2 max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2")}
        >
          <DialogHeader className="shrink-0"><DialogTitle>{title}</DialogTitle></DialogHeader>
          {body("-mx-4")}
          {foot("-mx-4")}
          <DialogPrimitive.Close asChild><Button variant="ghost" size="sm" className="self-end">Close</Button></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
  if (mobile) {
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

/**
 * Submit feedback under a CommandForm body. Errors (`error`, or `tone="error"`
 * children) render as `role="alert"` so screen readers interrupt with the
 * failure; soft warnings (`tone="warning"`, e.g. confirm_order's ATP list)
 * render as a polite `role="status"` region. Renders nothing when empty.
 * Login's inline error (components/login-form.tsx) is the same pattern.
 */
export function CommandFormMessage({
  error,
  tone = "error",
  className,
  children,
}: {
  error?: string | null;
  tone?: "error" | "warning";
  className?: string;
  children?: React.ReactNode;
}) {
  const content = children ?? error;
  if (!content) return null;
  const live = tone === "error" ? { role: "alert" as const } : { role: "status" as const, "aria-live": "polite" as const };
  return (
    <p {...live} className={cn("text-sm", tone === "error" ? "text-destructive" : "text-warning-foreground", className)}>
      {content}
    </p>
  );
}
