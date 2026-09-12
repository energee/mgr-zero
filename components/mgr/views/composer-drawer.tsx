"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const MINIMIZED = "44px";
const COMPACT = "480px";
const EXPANDED = 1;

export function ComposerDrawerView({ children, open, onOpenChange }: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const chatOpen = open ?? internalOpen;
  const minimized = isMobile ? "92px" : MINIMIZED;
  const snapPoint = !chatOpen ? minimized : expanded ? EXPANDED : COMPACT;
  const setSnapPoint = (point: string | number | null) => {
    const nextOpen = point !== minimized;
    setExpanded(point === EXPANDED);
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const nextSnapPoint = snapPoint === minimized ? COMPACT : snapPoint === COMPACT ? EXPANDED : minimized;
  const handleLabel = snapPoint === minimized ? "Open Ask MGR" : snapPoint === COMPACT ? "Expand Ask MGR" : "Minimize Ask MGR";

  return (
    <Drawer
      open
      modal={false}
      disablePointerDismissal
      snapToSequentialPoints
      snapPoints={[minimized, COMPACT, EXPANDED]}
      snapPoint={snapPoint}
      onSnapPointChange={setSnapPoint}
    >
      <DrawerContent
        // Keep the initial peek stationary while Base UI measures its portal.
        className={cn("h-dvh! max-h-none! border-t [--composer-peek:44px] max-md:[--composer-peek:92px]", !interacted && !chatOpen && "transform-[translate3d(0,calc(100%-var(--composer-peek)),0)]! transition-none!")}
        initialFocus={false}
        handle={<div
          className="group h-11 w-full shrink-0 cursor-grab touch-pan-x active:cursor-grabbing"
          onPointerDown={(event) => {
            setInteracted(true);
            const startY = event.clientY;
            addEventListener("pointerup", ({ clientY }) => {
              if (Math.abs(clientY - startY) < 8) setSnapPoint(nextSnapPoint);
            }, { once: true });
          }}
        >
          <Button type="button" variant="ghost" aria-label={handleLabel} aria-expanded={snapPoint === EXPANDED} className="pointer-events-none h-11 w-full rounded-none" onClick={() => setSnapPoint(nextSnapPoint)}>
            <span aria-hidden="true" className="h-1 w-12 rounded-full bg-muted-foreground/25 motion-safe:transition-[width,background-color] group-hover:w-16 group-hover:bg-muted-foreground/45" />
          </Button>
        </div>}
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>Ask MGR</DrawerTitle>
          <DrawerDescription>Chat with your brewery data and complete work in MGR.</DrawerDescription>
        </DrawerHeader>
        <div className={`flex min-h-0 w-full flex-col gap-3 overflow-y-auto px-4 pt-2 ${snapPoint === minimized ? "h-0 overflow-hidden p-0" : snapPoint === EXPANDED ? "flex-1 pb-4 max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]" : "h-[calc(30rem-2.75rem)] pb-4 max-md:h-[calc(27rem-2.75rem)]"}`}>{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
