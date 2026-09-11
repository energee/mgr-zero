"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHandle, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

const PEEK = "44px";
const EXPANDED = 0.92;

export function ComposerDrawerView({ children, open, onOpenChange }: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const expanded = open ?? internalOpen;
  const setExpanded = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Drawer
      open
      modal={false}
      dismissible={false}
      handleOnly
      snapPoints={[PEEK, EXPANDED]}
      activeSnapPoint={expanded ? EXPANDED : PEEK}
      setActiveSnapPoint={(point) => setExpanded(point === EXPANDED)}
      fadeFromIndex={1}
      noBodyStyles
    >
      <DrawerContent className="h-dvh! max-h-none! max-md:bottom-[calc(3rem+env(safe-area-inset-bottom))]! [&>div:first-child]:hidden">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Ask MGR</DrawerTitle>
          <DrawerDescription>Chat with your brewery data and complete work in MGR.</DrawerDescription>
        </DrawerHeader>
        <DrawerHandle preventCycle className="h-11! w-full! bg-transparent! opacity-100!">
          <Button type="button" variant="ghost" aria-label={expanded ? "Minimize Ask MGR" : "Open Ask MGR"} aria-expanded={expanded} className="group h-11 w-full shrink-0 rounded-none" onClick={() => setExpanded(!expanded)}>
            <span aria-hidden="true" className="h-1 w-12 rounded-full bg-muted-foreground/25 motion-safe:transition-[width,background-color] group-hover:w-16 group-hover:bg-muted-foreground/45" />
          </Button>
        </DrawerHandle>
        <div className="flex min-h-0 w-full flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-2">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
