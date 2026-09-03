// components/mgr/screen-width.tsx — the published inventory's viewport control.
// The /design gallery switches iframe width (app/(design)/design/gallery.tsx);
// this page renders frames inline, so the same choice is a data attribute and
// the widths land in app/(docs)/docs/docs.css. Sticky, so the control stays
// reachable a hundred frames down. The theme button is the app's own toggle —
// Fumadocs' switch is disabled in the docs layout because app/layout.tsx's boot
// script owns the `.dark` class, and two owners would fight over it.
"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
      {children}
    </div>
  );
}
