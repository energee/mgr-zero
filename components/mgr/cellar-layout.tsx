"use client";
// components/mgr/cellar-layout.tsx — Cellar's Tiles / Rows switch. The page
// draws its tanks both ways; this shows one and saves the choice in the
// `cellar_layout` cookie. The page reads that cookie on the server, so the
// saved layout is drawn from the first paint, after a reading round and on the
// next visit.
import { useState, type ReactNode } from "react";
import { GridViewIcon, ListViewIcon } from "@hugeicons/core-free-icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/mgr/icon";
import { CELLAR_LAYOUT_COOKIE, type CellarMapViewModel } from "@/lib/mgr/cellar-map-view";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** `initial` is the saved choice the page read from the cookie; none means Tiles. */
export function CellarLayout({ tiles, rows, initial = "Tiles" }: { tiles: ReactNode; rows: ReactNode; initial?: CellarMapViewModel["layout"] }) {
  const [layout, setLayout] = useState<string>(initial);
  const pick = (value: string) => {
    // The group sends "" when the pressed item is tapped again: one layout always stays picked.
    if (!value) return;
    setLayout(value);
    document.cookie = `${CELLAR_LAYOUT_COOKIE}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  };
  return <>
    <div className="flex justify-end">
      <ToggleGroup type="single" size="sm" value={layout} onValueChange={pick} aria-label="Layout">
        <ToggleGroupItem value="Tiles" aria-label="Tiles" title="Tiles"><Icon icon={GridViewIcon} /></ToggleGroupItem>
        <ToggleGroupItem value="Rows" aria-label="Rows" title="Rows"><Icon icon={ListViewIcon} /></ToggleGroupItem>
      </ToggleGroup>
    </div>
    {layout === "Rows" ? rows : tiles}
  </>;
}
