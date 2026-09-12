"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "@/lib/utils"

function Drawer({ swipeDirection = "down", ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" swipeDirection={swipeDirection} {...props} />
}

function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal(props: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return <DrawerPrimitive.Backdrop data-slot="drawer-overlay" className={cn("fixed inset-0 z-50 bg-black/10 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0", className)} {...props} />
}

function DrawerContent({ className, children, handle, ...props }: DrawerPrimitive.Popup.Props & { handle?: React.ReactNode }) {
  return (
    <DrawerPortal>
      <DrawerPrimitive.Viewport className="pointer-events-none fixed inset-0 z-50 select-none">
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          className={cn(
            "group/drawer-popup pointer-events-auto fixed inset-x-0 bottom-0 flex h-(--drawer-content-height) max-h-dvh min-h-0 w-full transform-[translate3d(0,var(--drawer-snap-point-offset,0px),0)] flex-col bg-popover text-sm text-popover-foreground outline-none transition-transform duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform data-ending-style:transform-[translate3d(0,calc(100%+2px),0)] data-starting-style:transform-[translate3d(0,calc(100%+2px),0)] data-swiping:transform-[translate3d(0,calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)),0)] data-swiping:duration-0",
            className
          )}
          {...props}
        >
          {handle}
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("flex shrink-0 flex-col", className)} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("mt-auto flex shrink-0 flex-col", className)} {...props} />
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("font-heading text-base font-medium", className)} {...props} />
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-muted-foreground", className)} {...props} />
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle, DrawerTrigger }
