"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHandle, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

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
      dismissible={false}
      handleOnly
      snapPoints={[minimized, COMPACT, EXPANDED]}
      activeSnapPoint={snapPoint}
      setActiveSnapPoint={setSnapPoint}
      fadeFromIndex={2}
      noBodyStyles
    >
      <DrawerContent className="h-dvh! max-h-none! [&>div:first-child]:hidden">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Ask MGR</DrawerTitle>
          <DrawerDescription>Chat with your brewery data and complete work in MGR.</DrawerDescription>
        </DrawerHeader>
        <DrawerHandle preventCycle className="h-11! w-full! bg-transparent! opacity-100!">
          <Button type="button" variant="ghost" aria-label={handleLabel} aria-expanded={snapPoint === EXPANDED} className="group h-11 w-full shrink-0 rounded-none" onClick={() => setSnapPoint(nextSnapPoint)}>
            <span aria-hidden="true" className="h-1 w-12 rounded-full bg-muted-foreground/25 motion-safe:transition-[width,background-color] group-hover:w-16 group-hover:bg-muted-foreground/45" />
          </Button>
        </DrawerHandle>
        <div className={`flex min-h-0 w-full flex-col gap-3 overflow-y-auto px-4 pt-2 ${snapPoint === minimized ? "h-0 overflow-hidden p-0" : snapPoint === EXPANDED ? "flex-1 pb-4 max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]" : "h-[calc(30rem-2.75rem)] pb-4 max-md:h-[calc(27rem-2.75rem)]"}`}>{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
