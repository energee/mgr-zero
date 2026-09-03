// app/(design)/design/gallery.tsx — client half of the gallery: one lazy
// iframe per screen plus a phone/desktop switch that changes iframe width
// without reloading (each frame is ~1 MB of dev-mode JS, so two per screen
// doubled the page's parse cost for no extra information).
"use client";

import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const WIDTHS = { phone: 390, desk: 1280 } as const;

export function Gallery({ frames }: { frames: { name: string; caption: React.ReactNode }[] }) {
  const [mode, setMode] = useState<keyof typeof WIDTHS>("phone");
  const width = WIDTHS[mode];
  return (
    <>
      <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as keyof typeof WIDTHS)} className="sticky top-2 z-10 w-fit bg-background">
        <ToggleGroupItem value="phone">Phone · 390</ToggleGroupItem>
        <ToggleGroupItem value="desk">Desk · 1280</ToggleGroupItem>
      </ToggleGroup>
      {frames.map((f, i) => (
        <article key={f.name} id={`s${i}`} className="flex scroll-mt-4 flex-col gap-2">
          {f.caption}
          <iframe src={`/design/frame?s=${i}`} title={`${f.name} at ${width}px`} width={width} height={820} loading="lazy" className="max-w-full shrink-0 rounded-lg border bg-background" />
        </article>
      ))}
    </>
  );
}
