// components/mgr/screen-width.tsx — the published inventory's viewport control
// and the frame embed it drives. Frames are iframes because the shell's
// phone/desktop split comes from viewport
// breakpoints, so a frame rendered inline in a narrow box would still lay out as
// desktop. Changing the width changes the iframe attribute without reloading.
// Sticky, so the control stays reachable a hundred frames down. The theme button is the app's own toggle —
// Fumadocs' switch is disabled in the docs layout because app/layout.tsx's boot
// script owns the `.dark` class, and two owners would fight over it.
"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type Mode = "phone" | "desk";

function syncFrames() {
  const dark = document.documentElement.classList.contains("dark");
  for (const f of document.querySelectorAll("iframe")) f.contentDocument?.documentElement.classList.toggle("dark", dark);
}
const WidthContext = createContext<Mode>("phone");

// Desktop frames lay out at a fixed 1024px viewport and are scaled to fit the
// column: the shell's rail needs a 768px-wide viewport, and a docs column beside
// a sidebar and table of contents is narrower than that on most laptops, so
// "fill the column" drew the phone layout under a Desktop label.
const DESK = 1024;

/** One frame, embedded at a real viewport width — see app/(frames)/screens/frame. */
export function ScreenIframe({ index, title, mode }: { index: number; title: string; mode: Mode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el || mode !== "desk") return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / DESK)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  const desk = mode === "desk";
  const height = 780;
  return (
    <div ref={box} style={{ height: desk ? height * scale : height }} className="max-w-full overflow-hidden">
      <iframe
        src={`/screens/frame/${index}`}
        title={`${title} · ${mode}`}
        height={height}
        loading="lazy"
        style={desk ? { width: DESK, transform: `scale(${scale})`, transformOrigin: "top left" } : { width: 390 }}
        className={desk ? "max-w-none rounded-lg border bg-background" : "max-w-full rounded-lg border bg-background"}
      />
    </div>
  );
}

/** A frame at the width the surrounding <ScreenWidth> chose. */
export function ScreenEmbed(props: { index: number; title: string }) {
  return <ScreenIframe {...props} mode={useContext(WidthContext)} />;
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
