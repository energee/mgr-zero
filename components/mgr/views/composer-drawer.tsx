"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";

/** Shared staff-shell entry point and overlay; live and inventory supply the conversation. */
export function ComposerDrawerView({ children, open, onOpenChange, container }: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | null;
}) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const chatOpen = open ?? internalOpen;
  const panelId = useId();
  const navigateRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function changeOpen(nextOpen: boolean) {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    if (!chatOpen || !isMobile) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(panel.ownerDocument.activeElement)) panel.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [chatOpen, isMobile]);

  return (
    <Dialog.Root open={chatOpen} onOpenChange={(nextOpen, details) => {
      // Radix foreground forms handle Escape before this Base UI panel.
      if (details.reason === "escape-key" && details.event.defaultPrevented) {
        details.cancel();
        return;
      }
      changeOpen(nextOpen);
    }} modal={isMobile} disablePointerDismissal>
      <ToggleGroup type="single" value={chatOpen ? "chat" : "navigate"} onValueChange={(value) => { if (value) changeOpen(value === "chat"); }} variant="outline" size="sm" spacing={0} aria-label="Workspace mode">
        <ToggleGroupItem ref={navigateRef} value="navigate">Navigate</ToggleGroupItem>
        <ToggleGroupItem value="chat" aria-controls={panelId} aria-expanded={chatOpen} aria-keyshortcuts="Meta+K Control+K" title="Ask MGR (⌘K / Ctrl+K)">Ask MGR</ToggleGroupItem>
      </ToggleGroup>
      <Dialog.Portal container={container} keepMounted>
        <Dialog.Popup
          id={panelId}
          ref={panelRef}
          data-mgr-composer=""
          initialFocus={panelRef}
          finalFocus={navigateRef}
          className="fixed inset-y-0 right-0 flex w-full min-h-0 flex-col overflow-hidden border-l bg-popover text-sm text-popover-foreground shadow-lg outline-none data-closed:hidden md:top-12 md:w-[min(32rem,calc(100vw-12rem))]"
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
