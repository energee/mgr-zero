"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

function subscribeToForegroundDialogs(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

function hasForegroundDialog() {
  // Closing Radix surfaces still own focus until their exit animation unmounts them.
  return document.querySelector('[data-slot="dialog-content"], [data-slot="sheet-content"], [role="alertdialog"][data-state]') !== null;
}

function subscribeToFocus(onChange: () => void) {
  document.addEventListener("focusin", onChange);
  return () => document.removeEventListener("focusin", onChange);
}

/** Shared staff-shell entry point and overlay; live and inventory supply the conversation.
 *  One Ask MGR button opens and closes the panel; Back to page or Escape also
 *  closes it, and focus returns to Ask MGR (#1512). */
export function ComposerPanelView({ children, open, onOpenChange, container }: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | null;
}) {
  const isMobile = useIsMobile();
  // Radix forms own focus and accessibility while layered above this Base UI panel.
  const foregroundDialogOpen = useSyncExternalStore(subscribeToForegroundDialogs, hasForegroundDialog, () => false);
  const [internalOpen, setInternalOpen] = useState(false);
  const chatOpen = open ?? internalOpen;
  const panelId = useId();
  const askRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Enter the portal while non-modal so Base UI restores its tab stops before trapping focus.
  const panelHasFocus = useSyncExternalStore(subscribeToFocus, () => panelRef.current?.contains(document.activeElement) ?? false, () => false);

  function changeOpen(nextOpen: boolean) {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    if (!chatOpen || !isMobile || foregroundDialogOpen || panelHasFocus) return;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [chatOpen, isMobile, foregroundDialogOpen, panelHasFocus]);

  return (
    <Dialog.Root open={chatOpen} onOpenChange={(nextOpen, details) => {
      // Radix foreground forms handle Escape before this Base UI panel.
      if (details.reason === "escape-key" && (foregroundDialogOpen || details.event.defaultPrevented)) {
        details.cancel();
        return;
      }
      changeOpen(nextOpen);
    }} modal={isMobile && !foregroundDialogOpen && panelHasFocus} disablePointerDismissal>
      <Button ref={askRef} type="button" variant={chatOpen ? "secondary" : "outline"} size="sm" onClick={() => changeOpen(!chatOpen)} aria-controls={panelId} aria-expanded={chatOpen} aria-keyshortcuts="Meta+K Control+K" title="Ask MGR (⌘K / Ctrl+K)">Ask MGR</Button>
      <Dialog.Portal container={container} keepMounted>
        <Dialog.Popup
          id={panelId}
          ref={panelRef}
          data-mgr-composer=""
          initialFocus={foregroundDialogOpen ? false : panelRef}
          finalFocus={foregroundDialogOpen ? false : askRef}
          className="fixed inset-y-0 right-0 flex w-full max-w-full min-h-0 flex-col overflow-hidden border-l bg-popover text-sm text-popover-foreground shadow-lg outline-none data-closed:hidden md:top-12 md:w-[min(32rem,calc(100vw-12rem))]"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
            <Dialog.Title className="font-semibold">Ask MGR</Dialog.Title>
            <Button type="button" variant="ghost" size="sm" data-preview-action onClick={() => changeOpen(false)}>Back to page</Button>
          </div>
          <Dialog.Description className="sr-only">Chat with your brewery data. Closing keeps your conversation and unsent message.</Dialog.Description>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
