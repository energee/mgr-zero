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

type Mode = "phone" | "desk";

function syncFrames() {
  const dark = document.documentElement.classList.contains("dark");
  for (const f of document.querySelectorAll("iframe")) f.contentDocument?.documentElement.classList.toggle("dark", dark);
}
const WidthContext = createContext<Mode>("phone");

/** One frame, embedded at a real viewport width — see app/(frames)/screens/frame. */
export function ScreenEmbed({ index, title }: { index: number; title: string }) {
  const mode = useContext(WidthContext);
  // Mobile is a real 390px viewport. Desktop fills the column: the shell draws its
  // rail at any width from 768 up, and a fixed 1280 only guaranteed a
  // horizontal scroll on most screens. The page lifts Fumadocs' width caps so
  // the column is wide enough to clear the breakpoint.
  return (
    <iframe
      src={`/screens/frame/${index}`}
      title={`${title} · ${mode}`}
      height={780}
      loading="lazy"
      style={{ width: mode === "phone" ? 390 : "100%" }}
      className="max-w-full rounded-lg border bg-background"
    />
  );
}

/** `deskOnly` pins the width and hides the switch — the external venues are
 * desktop products (QuickBooks and Square Dashboard have no phone layout to
 * show), so offering Mobile there would only draw them broken. */
export function ScreenWidth({ children, deskOnly = false }: { children: React.ReactNode; deskOnly?: boolean }) {
  const [mode, setMode] = useState<Mode>(deskOnly ? "desk" : "phone");
  return (
    <div className="flex flex-col gap-8">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-fd-background/95 py-2 backdrop-blur">
        {!deskOnly && (
          <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as Mode)}>
            <ToggleGroupItem value="phone">Mobile</ToggleGroupItem>
            <ToggleGroupItem value="desk">Desktop</ToggleGroupItem>
          </ToggleGroup>
        )}
        {/* Each frame is its own document, so the toggle's class change does not
            reach them. They are same-origin, so copy the choice across after it
            lands; a frame that has not loaded yet reads localStorage in its own
            boot script and comes up correct on its own. */}
        <div onClick={() => queueMicrotask(syncFrames)}><ThemeToggle compact /></div>
      </div>
      <WidthContext.Provider value={mode}>{children}</WidthContext.Provider>
    </div>
  );
}
