// components/mgr/screen-width.tsx — the published inventory's viewport control
// and the frame embed it drives. Frames are iframes for the same reason the
// /design gallery uses them: the shell's phone/desktop split comes from viewport
// breakpoints, so a frame rendered inline in a narrow box would still lay out as
// desktop. Changing the width changes the iframe attribute without reloading.
// Sticky, so the control stays reachable a hundred frames down. The theme button is the app's own toggle —
// Fumadocs' switch is disabled in the docs layout because app/layout.tsx's boot
// script owns the `.dark` class, and two owners would fight over it.
"use client";

import { createContext, useContext, useState } from "react";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const WIDTHS = { phone: 390, desk: 1280 } as const;
const WidthContext = createContext<number>(WIDTHS.phone);

/** One frame, embedded at a real viewport width — see app/(frames)/screens/frame. */
export function ScreenEmbed({ index, title }: { index: number; title: string }) {
  const width = useContext(WidthContext);
  return (
    <iframe
      src={`/screens/frame?s=${index}`}
      title={`${title} at ${width}px`}
      width={width}
      height={780}
      loading="lazy"
      // No max-width: clamping the iframe to the docs column would shrink its
      // viewport back below the shell's md breakpoint, so Desk would still draw the
      // phone layout. The wrapper scrolls instead.
      className="rounded-lg border bg-background"
    />
  );
}

export function ScreenWidth({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<"phone" | "desk">("phone");
  return (
    <div className="flex flex-col gap-8" data-screen-width={mode}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-fd-background/95 py-2 backdrop-blur">
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as "phone" | "desk")}>
          <ToggleGroupItem value="phone">Phone · 390</ToggleGroupItem>
          <ToggleGroupItem value="desk">Desk · 1280</ToggleGroupItem>
        </ToggleGroup>
        <div className="w-40"><ThemeToggle /></div>
      </div>
      <WidthContext.Provider value={WIDTHS[mode]}>{children}</WidthContext.Provider>
    </div>
  );
}
