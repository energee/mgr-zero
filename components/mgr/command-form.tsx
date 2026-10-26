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
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { isValidElement } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Icon } from "@/components/mgr/icon";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

// Closing dismisses the surface; it is not a destructive domain action.
// Route through the controlled boundary so both Dialog and Sheet reset form state.
function FormClose({ className, onClose, previewAction }: { className: string; onClose?: (open: boolean) => void; previewAction?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" className={className} onClick={() => onClose?.(false)} data-preview-action={previewAction || undefined}>
      <Icon icon={Cancel01Icon} />
      <span className="sr-only">Close</span>
    </Button>
  );
}

export function CommandForm({
  open,
  onOpenChange,
  trigger,
  title,
  footer,
  container,
  children,
  previewAction,
}: {
  open: boolean;
  /** Where the sheet or dialog portals to; the screen explorer keeps it inside its box. */
  container?: HTMLElement | null;
  /** Keeps this inventory picker and its dismissal controls inside the explorer. */
  previewAction?: boolean;
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
          data-preview-action={previewAction || undefined}
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn("fixed z-50 flex flex-col gap-4 overflow-hidden rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10", mobile ? "inset-x-0 bottom-0 max-h-[calc(100%-1rem)]" : "top-1/2 left-1/2 max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2")}
        >
          <DialogHeader className="shrink-0"><DialogTitle>{title}</DialogTitle></DialogHeader>
          {body("-mx-4")}
          {foot("-mx-4")}
          <FormClose className="absolute top-3 right-3" onClose={onOpenChange} previewAction={previewAction} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent showCloseButton={false} side="bottom" className="flex max-h-[90svh] flex-col overflow-hidden rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]" data-preview-action={previewAction || undefined}>
          <SheetHeader className="shrink-0 pb-0">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {body("")}
          {foot("")}
          <FormClose className="absolute top-3 right-3" onClose={onOpenChange} previewAction={previewAction} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent showCloseButton={false} className="flex max-h-[90svh] flex-col overflow-hidden sm:max-w-md" data-preview-action={previewAction || undefined}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body("-mx-4")}
        {foot("-mx-4")}
        <FormClose className="absolute top-2 right-2" onClose={onOpenChange} previewAction={previewAction} />
      </DialogContent>
    </Dialog>
  );
}

/** Action row at the bottom of a CommandForm body: stacked on phone, right-aligned on desk. */
/** A drawn row (E.row, E.nav) as a sheet trigger: it is not focusable, so it
 *  gets a button around it; a Button (E.act, E.btn) is one already and nesting
 *  would be invalid. */
export const asTrigger = (node: React.ReactNode) =>
  isValidElement(node) && node.type === Button ? node : <button type="button" className="block w-full text-left">{node}</button>;

/** The row-or-add trigger every registry sheet shares: ghost Edit on a row, outline add beside the list.
 *  `name` is the row's label, so a list of Edit buttons reads "Edit CA license" to assistive tech. */
export function sheetTrigger(edit: boolean, add: string, name?: string) {
  return edit ? <Button variant="ghost" size="sm" aria-label={name ? `Edit ${name}` : undefined}>Edit</Button> : <Button variant="outline" size="sm">{add}</Button>;
}

export function CommandFormFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 pt-2 md:flex-row md:justify-end", className)} {...props} />;
}

/**
 * Submit feedback under a CommandForm body. Errors (`error`, or `tone="error"`
 * children) render as `role="alert"` so screen readers interrupt with the
 * failure; soft warnings (`tone="warning"`, e.g. confirm_order's ATP list)
 * render as a polite `role="status"` region. Renders nothing when empty.
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
