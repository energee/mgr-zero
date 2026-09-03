// app/(design)/design/gallery.tsx — client half of the gallery: one lazy
// iframe per screen plus a phone/desktop switch that changes iframe width
// without reloading (each frame is ~1 MB of dev-mode JS, so two per screen
// doubled the page's parse cost for no extra information).
"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const WIDTHS = { phone: 390, desk: 1280 } as const;

function syncFrames() {
  const dark = document.documentElement.classList.contains("dark");
  for (const f of document.querySelectorAll("iframe")) {
    f.contentDocument?.documentElement.classList.toggle("dark", dark);
  }
}

export function Gallery({ frames }: { frames: { name: string; caption: React.ReactNode }[] }) {
  const [mode, setMode] = useState<keyof typeof WIDTHS>("phone");
  const width = WIDTHS[mode];
  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-background py-2">
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as keyof typeof WIDTHS)}>
          <ToggleGroupItem value="phone">Phone · 390</ToggleGroupItem>
          <ToggleGroupItem value="desk">Desk · 1280</ToggleGroupItem>
        </ToggleGroup>
        {/* Each frame is its own document, so the toggle's class change does not
            reach them. They are same-origin, so copy the choice across after it
            lands; a frame that has not lazily loaded yet reads localStorage in
            its own boot script and comes up correct on its own. */}
        <div className="w-44" onClick={() => queueMicrotask(syncFrames)}><ThemeToggle /></div>
      </div>
      {frames.map((f, i) => (
        <article key={f.name} id={`s${i}`} className="flex scroll-mt-4 flex-col gap-2">
          {f.caption}
          <iframe src={`/design/frame?s=${i}`} title={`${f.name} at ${width}px`} width={width} height={820} loading="lazy" className="max-w-full shrink-0 rounded-lg border bg-background" />
        </article>
      ))}
    </>
  );
}
